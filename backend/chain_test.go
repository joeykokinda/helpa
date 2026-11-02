package main

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
)

// The chain after a diagnosis, offline: fair price, Helpa reaching out (only with permission), the shop's demo
// reply, and the job updated from what the pro said.
func TestProChain(t *testing.T) {
	dataDir = t.TempDir()
	previous := replayDir
	replayDir = "fixtures"
	defer func() { replayDir = previous }()
	mux := http.NewServeMux()
	saved := http.DefaultServeMux
	http.DefaultServeMux = mux
	registerJobRoutes()
	http.DefaultServeMux = saved

	device := "0123456789abcdef0123456789abcdef"
	call := func(path string, body any, want int) map[string]any {
		data, _ := json.Marshal(body)
		request := httptest.NewRequest("POST", path, bytes.NewReader(data))
		request.Header.Set("X-Helpa-Device", device)
		recorder := httptest.NewRecorder()
		mux.ServeHTTP(recorder, request)
		if recorder.Code != want {
			t.Fatalf("%s: %d %s", path, recorder.Code, recorder.Body.String())
		}
		var out map[string]any
		json.Unmarshal(recorder.Body.Bytes(), &out)
		return out
	}

	id := call("/api/jobs", map[string]any{"title": "Dryer runs but no heat", "appliance": "electric dryer", "status": "needs_pro"}, 200)["id"].(string)
	call("/api/jobs/"+id+"/pros/find", map[string]any{"location": "47906"}, 200)
	priced := call("/api/jobs/"+id+"/fair-price", map[string]any{}, 200)
	if fair := priced["fair_price"].(map[string]any); fair["high"].(float64) != 250 || len(fair["sources"].([]any)) != 2 {
		t.Fatalf("fair price: %v", fair)
	}

	pro := jobs.read(device).Jobs[0].Pros[0].Name
	slots := []map[string]any{{"label": "Tomorrow morning", "at": 1}}
	call("/api/jobs/"+id+"/reach-out", map[string]any{"pro": pro, "message": "Hi", "slots": slots}, 400)
	reached := call("/api/jobs/"+id+"/reach-out", map[string]any{"pro": pro, "message": "Hi", "permission": true, "slots": slots}, 200)
	contact := reached["contact"].(map[string]any)
	if contact["demo"] != true || contact["quote_low"].(float64) != 165 || contact["slot_label"] != "Tomorrow morning" {
		t.Fatalf("contact: %v", contact)
	}

	said := call("/api/jobs/"+id+"/pro-said", map[string]any{"text": "It's the thermal fuse, part 279973, $140 installed"}, 200)
	item := said["job"].(map[string]any)
	if item["status"] != "needs_part" || item["parts_needed"].([]any)[0] != "Thermal fuse (part number 279973)" || said["above_fair"] != false {
		t.Fatalf("pro said: %v", said)
	}
}

func TestCleanPriceNeedsSources(t *testing.T) {
	price := cleanPrice(fairPrice{Low: 300, High: 100, Sources: []string{"https://www.angi.com/a", "https://www.angi.com/b", "not a url"}})
	if price.Low != 100 || price.High != 300 || len(price.Sources) != 1 || price.Sources[0] != "angi.com" {
		t.Fatalf("sorted with sources: %+v", price)
	}
	if unsourced := cleanPrice(fairPrice{Low: 100, High: 300}); unsourced.High != 0 {
		t.Fatalf("numbers without a source must be dropped: %+v", unsourced)
	}
}
