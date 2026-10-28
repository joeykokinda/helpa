package main

import (
	"encoding/json"
	"log"
	"math"
	"net"
	"net/http"
	"os"
	"strconv"
	"strings"
	"sync"
	"time"
)

// The API is public with no login, so every visitor gets per-route token buckets and the Meta key a daily budget.

type routeLimit struct {
	perMinute float64
	burst     float64
}

// Live locate fires about once a second with up to four SAM calls each, so it gets the tightest budget per call.
var routeLimits = map[string]routeLimit{
	"/api/fix":        {perMinute: 4, burst: 3},
	"/api/check":      {perMinute: 20, burst: 6},
	"/api/locate":     {perMinute: 40, burst: 8},
	"/api/read-label": {perMinute: 8, burst: 3},
	"/api/transcribe": {perMinute: 15, burst: 5},
	"/api/answer":     {perMinute: 60, burst: 20},
	"/api/ask":        {perMinute: 10, burst: 4},
}

var defaultLimit = routeLimit{perMinute: 120, burst: 30}

type bucket struct {
	tokens float64
	last   time.Time
}

type limiter struct {
	mutex   sync.Mutex
	buckets map[string]*bucket
	now     func() time.Time
}

func newLimiter() *limiter {
	return &limiter{buckets: map[string]*bucket{}, now: time.Now}
}

// allow takes one token from the bucket for key, refilling at limit.perMinute.
// ponytail: buckets live in memory and are swept lazily; fine for one process, use a shared store if it ever scales out.
func (l *limiter) allow(key string, limit routeLimit) bool {
	l.mutex.Lock()
	defer l.mutex.Unlock()
	now := l.now()
	current, found := l.buckets[key]
	if !found {
		if len(l.buckets) > 50000 {
			l.buckets = map[string]*bucket{}
		}
		current = &bucket{tokens: limit.burst, last: now}
		l.buckets[key] = current
	}
	current.tokens = math.Min(limit.burst, current.tokens+now.Sub(current.last).Minutes()*limit.perMinute)
	current.last = now
	if current.tokens < 1 {
		return false
	}
	current.tokens--
	return true
}

// clientIP trusts X-Forwarded-For only when the connection comes from this machine (the Next proxy or the tunnel),
// and then takes the rightmost address that isn't loopback, which is the one our own proxy chain appended.
func clientIP(request *http.Request) string {
	host, _, err := net.SplitHostPort(request.RemoteAddr)
	if err != nil {
		host = request.RemoteAddr
	}
	if ip := net.ParseIP(host); ip == nil || !ip.IsLoopback() {
		return host
	}
	hops := strings.Split(request.Header.Get("X-Forwarded-For"), ",")
	for index := len(hops) - 1; index >= 0; index-- {
		hop := strings.TrimSpace(hops[index])
		if ip := net.ParseIP(hop); ip != nil && !ip.IsLoopback() {
			return hop
		}
	}
	return host
}

var visitors = newLimiter()

func withLimits(next http.Handler) http.Handler {
	return http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		if request.Method == http.MethodOptions {
			next.ServeHTTP(writer, request)
			return
		}
		route := request.URL.Path
		limit, found := routeLimits[route]
		if !found {
			limit = defaultLimit
			route = "other"
		}
		if !visitors.allow(clientIP(request)+" "+route, limit) {
			writer.Header().Set("Retry-After", "20")
			http.Error(writer, "Helpa needs a breather. Try again in a few seconds.", http.StatusTooManyRequests)
			return
		}
		next.ServeHTTP(writer, request)
	})
}

/* ---------- daily Meta spend ---------- */

// Prices in USD per million tokens. Muse Spark's published API price; the others aren't published, so they
// default to the same and can be set with HELPA_PRICE_<MODEL>=input,output (e.g. HELPA_PRICE_MUSE_WONDER_1_0=5,20).
var defaultPrice = [2]float64{1.25, 4.25}

const webSearchPrice = 2.50 / 1000

func priceFor(model string) [2]float64 {
	key := "HELPA_PRICE_" + strings.ToUpper(strings.NewReplacer("-", "_", ".", "_").Replace(model))
	input, output, found := strings.Cut(os.Getenv(key), ",")
	if !found {
		return defaultPrice
	}
	inputPrice, errIn := strconv.ParseFloat(input, 64)
	outputPrice, errOut := strconv.ParseFloat(output, 64)
	if errIn != nil || errOut != nil {
		return defaultPrice
	}
	return [2]float64{inputPrice, outputPrice}
}

// ponytail: the tally lives in memory, so a restart re-grants the day's budget; persist it if restarts get frequent.
type meter struct {
	mutex  sync.Mutex
	day    string
	spent  float64
	budget float64
	now    func() time.Time
}

func newMeter() *meter {
	budget := 15.0
	if value, err := strconv.ParseFloat(os.Getenv("HELPA_DAILY_BUDGET_USD"), 64); err == nil && value > 0 {
		budget = value
	}
	return &meter{budget: budget, now: time.Now}
}

var spend = newMeter()

// rollover resets the tally at UTC midnight. Callers hold the mutex.
func (m *meter) rollover() {
	if day := m.now().UTC().Format("2006-01-02"); day != m.day {
		m.day, m.spent = day, 0
	}
}

func (m *meter) add(dollars float64) {
	m.mutex.Lock()
	defer m.mutex.Unlock()
	m.rollover()
	m.spent += dollars
}

func (m *meter) record(model string, usage tokenUsage, searches int) {
	price := priceFor(model)
	m.add((float64(usage.InputTokens)*price[0]+float64(usage.OutputTokens)*price[1])/1e6 + float64(searches)*webSearchPrice)
}

func (m *meter) over() bool { return m.past(1) }

// past reports whether today's spend has reached fraction of the budget.
func (m *meter) past(fraction float64) bool {
	m.mutex.Lock()
	defer m.mutex.Unlock()
	m.rollover()
	return m.spent >= m.budget*fraction
}

func (m *meter) status() map[string]any {
	m.mutex.Lock()
	defer m.mutex.Unlock()
	m.rollover()
	return map[string]any{"ok": true, "spent_usd": math.Round(m.spent*10000) / 10000, "budget_usd": m.budget, "resting": m.spent >= m.budget}
}

type tokenUsage struct {
	InputTokens  int `json:"input_tokens"`
	OutputTokens int `json:"output_tokens"`
}

// recordReply tallies one Meta reply: its token usage plus any hosted web searches it ran.
func recordReply(body map[string]any, usage tokenUsage, items []outputItem) {
	searches := 0
	for _, item := range items {
		if item.Type == "web_search_call" {
			searches++
		}
	}
	model, _ := body["model"].(string)
	spend.record(model, usage, searches)
}

// restingSample is what /api/fix plays once the day's budget is spent: the recorded sample closest to the complaint.
func restingSample(complaint string) string {
	lowered := strings.ToLower(complaint)
	for _, id := range []string{"car", "dishwasher", "disposal", "washer", "dryer"} {
		if containsWords(lowered, id) {
			return id
		}
	}
	for word, id := range map[string]string{"oil": "car", "camry": "car", "dishes": "dishwasher", "sink": "disposal", "clothes": "dryer", "lint": "dryer"} {
		if containsWords(lowered, word) {
			return id
		}
	}
	return "dryer"
}

func handleHealth(writer http.ResponseWriter, _ *http.Request) {
	writer.Header().Set("Content-Type", "application/json")
	json.NewEncoder(writer).Encode(spend.status())
}

// overBudget answers the paid endpoints other than /api/fix once fraction of the day's budget is spent.
// Live locate stops at 80% so the rest of the day's budget goes to whole fixes.
func overBudget(writer http.ResponseWriter, fraction float64) bool {
	if !spend.past(fraction) {
		return false
	}
	log.Printf("budget: refusing a paid call, daily budget spent")
	http.Error(writer, "Helpa is resting for today. Try a sample, or come back tomorrow.", http.StatusServiceUnavailable)
	return true
}
