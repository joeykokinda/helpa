package main

import (
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
)

func TestLimiterRefills(t *testing.T) {
	clock := time.Unix(0, 0)
	limits := newLimiter()
	limits.now = func() time.Time { return clock }
	rule := routeLimit{perMinute: 6, burst: 2}
	if !limits.allow("a", rule) || !limits.allow("a", rule) {
		t.Fatal("burst should allow two")
	}
	if limits.allow("a", rule) {
		t.Fatal("third call in the same instant should be refused")
	}
	if !limits.allow("b", rule) {
		t.Fatal("another visitor has their own bucket")
	}
	clock = clock.Add(10 * time.Second) // 6 per minute refills one token every 10 s
	if !limits.allow("a", rule) || limits.allow("a", rule) {
		t.Fatal("ten seconds should refill exactly one token")
	}
}

func TestClientIP(t *testing.T) {
	request := httptest.NewRequest(http.MethodGet, "/", nil)
	request.RemoteAddr = "203.0.113.9:5000"
	request.Header.Set("X-Forwarded-For", "1.2.3.4")
	if got := clientIP(request); got != "203.0.113.9" {
		t.Fatalf("remote clients can't pick their address, got %s", got)
	}
	request.RemoteAddr = "127.0.0.1:5000"
	request.Header.Set("X-Forwarded-For", "6.6.6.6, 198.51.100.7, 127.0.0.1")
	if got := clientIP(request); got != "198.51.100.7" {
		t.Fatalf("behind our proxy, the rightmost non-loopback hop wins, got %s", got)
	}
}

func TestLimitsMiddleware(t *testing.T) {
	visitors = newLimiter()
	handler := withLimits(http.HandlerFunc(func(writer http.ResponseWriter, _ *http.Request) {}))
	codes := []int{}
	for range 4 {
		recorder := httptest.NewRecorder()
		request := httptest.NewRequest(http.MethodPost, "/api/fix", nil)
		request.RemoteAddr = "203.0.113.1:1"
		handler.ServeHTTP(recorder, request)
		codes = append(codes, recorder.Code)
	}
	if codes[2] != http.StatusOK || codes[3] != http.StatusTooManyRequests {
		t.Fatalf("fix allows a burst of 3 then 429s, got %v", codes)
	}
}

func TestMeterBudget(t *testing.T) {
	clock := time.Date(2026, 11, 1, 23, 0, 0, 0, time.UTC)
	meter := &meter{budget: 1, now: func() time.Time { return clock }}
	meter.record("muse-spark-1.3", tokenUsage{InputTokens: 400_000, OutputTokens: 0}, 0) // $0.50
	if meter.over() || !meter.past(0.5) {
		t.Fatal("half the budget spent")
	}
	meter.record("muse-spark-1.3", tokenUsage{OutputTokens: 100_000}, 20) // $0.425 + $0.05
	if meter.over() {
		t.Fatal("$0.975 is still under $1")
	}
	meter.record("sam-3.1", tokenUsage{InputTokens: 20_000}, 0)
	if !meter.over() {
		t.Fatal("budget should be spent")
	}
	clock = clock.Add(2 * time.Hour)
	if meter.over() {
		t.Fatal("a new UTC day starts a fresh budget")
	}
}

func TestRestingSampleExists(t *testing.T) {
	for _, complaint := range []string{"my Camry needs oil", "dishwasher gritty", "the sink hums", "clothes still wet", "something weird"} {
		sample := openSample(restingSample(complaint))
		if sample == nil {
			t.Fatalf("no resting sample for %q", complaint)
		}
		sample.Close()
	}
}
