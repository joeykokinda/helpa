package main

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
)

// The whole job loop offline: start a job, find the part, order it, the watcher walks the delivery to the door,
// a reminder comes due, a pro gets booked, and the summary for the pro says what was already ruled out.
func TestJobLoop(t *testing.T) {
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
	call := func(method, path string, body any) map[string]any {
		data, _ := json.Marshal(body)
		request := httptest.NewRequest(method, path, bytes.NewReader(data))
		request.Header.Set("X-Helpa-Device", device)
		recorder := httptest.NewRecorder()
		mux.ServeHTTP(recorder, request)
		if recorder.Code != 200 {
			t.Fatalf("%s %s: %d %s", method, path, recorder.Code, recorder.Body.String())
		}
		var out map[string]any
		json.Unmarshal(recorder.Body.Bytes(), &out)
		return out
	}

	created := call("POST", "/api/jobs", map[string]any{"title": "Dryer runs but no heat", "appliance": "electric dryer", "brand": "Whirlpool",
		"model": "WED5050LW", "diagnosis": "The thermal fuse has blown.", "ruledOut": []string{"a clogged lint screen"}, "partsNeeded": []string{"thermal fuse"}})
	id := created["id"].(string)

	found := call("POST", "/api/jobs/"+id+"/parts/find", map[string]any{})
	item := found["job"].(map[string]any)
	part := item["parts"].([]any)[0].(map[string]any)
	if part["part_number"] != "3392519" || len(part["buy"].([]any)) == 0 || found["sample"] != true {
		t.Fatalf("part finder: %v", part)
	}

	call("POST", "/api/jobs/"+id+"/parts/"+part["id"].(string)+"/ordered", map[string]any{"store": "RepairClinic", "tracking": "1Z999"})
	call("POST", "/api/jobs/"+id+"/follow-ups", map[string]any{"label": "Clean the dryer vent", "due": time.Now().Add(-time.Minute).UnixMilli()})

	watchOnce(context.Background(), time.Now().Add(2*time.Minute))
	file := jobs.read(device)
	got := file.Jobs[0]
	if got.Status != "part_arrived" || got.Parts[0].Status != "delivered" {
		t.Fatalf("after the watcher: job %s, part %s", got.Status, got.Parts[0].Status)
	}
	if !got.FollowUps[0].Notified {
		t.Errorf("the due reminder wasn't raised")
	}

	call("POST", "/api/jobs/"+id+"/pros/find", map[string]any{"location": "02139"})
	call("POST", "/api/jobs/"+id+"/appointment", map[string]any{"pro": "Sample Appliance Repair", "at": time.Now().Add(48 * time.Hour).UnixMilli()})
	got = jobs.read(device).Jobs[0]
	if got.Status != "pro_booked" || len(got.Pros) != 3 {
		t.Fatalf("booking: %s with %d pros", got.Status, len(got.Pros))
	}
	summary := got.summary()
	for _, want := range []string{"Whirlpool WED5050LW electric dryer", "Already ruled out: a clogged lint screen", "3392519"} {
		if !bytes.Contains([]byte(summary), []byte(want)) {
			t.Errorf("summary is missing %q:\n%s", want, summary)
		}
	}
	kinds := map[string]bool{}
	for _, entry := range got.Log {
		kinds[entry.Kind] = true
	}
	for _, kind := range []string{"diagnosed", "part_found", "part_ordered", "part_arrived", "reminder", "pros_found", "booked"} {
		if !kinds[kind] {
			t.Errorf("log has no %s entry", kind)
		}
	}
}

func TestJobsNeedADevice(t *testing.T) {
	mux := http.NewServeMux()
	saved := http.DefaultServeMux
	http.DefaultServeMux = mux
	registerJobRoutes()
	http.DefaultServeMux = saved
	recorder := httptest.NewRecorder()
	mux.ServeHTTP(recorder, httptest.NewRequest("GET", "/api/jobs", nil))
	if recorder.Code != http.StatusBadRequest {
		t.Errorf("no device id: %d", recorder.Code)
	}
}
