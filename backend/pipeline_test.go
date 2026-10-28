package main

import (
	"context"
	"io"
	"strings"
	"testing"
	"time"
)

func TestSamplesHavePlans(t *testing.T) {
	for _, id := range []string{"dishwasher", "dryer", "disposal", "washer", "car"} {
		sample := openSample(id)
		if sample == nil {
			t.Fatalf("sample %s is missing", id)
		}
		data, _ := io.ReadAll(sample)
		sample.Close()
		if !strings.Contains(string(data), `"type":"plan"`) {
			t.Errorf("sample %s has no plan", id)
		}
	}
	if openSample("../main.go") != nil || openSample("") != nil {
		t.Error("openSample must only open recorded samples")
	}
}

func TestSessionAskAndAnswer(t *testing.T) {
	session := newSession()
	defer session.close()
	asked := make(chan event, 1)
	emit := func(sent event) { asked <- sent }
	for round := 0; round < maxQuestions; round++ {
		go func() {
			question := <-asked
			if question["session"] != session.id || !answerSession(session.id, "It hums") {
				t.Errorf("round %d: answer not delivered", round)
			}
		}()
		answer, answered := session.ask(context.Background(), emit, "Does it hum?", []string{"It hums", "Silent"})
		if !answered || answer != "It hums" {
			t.Fatalf("round %d: got %q, %v", round, answer, answered)
		}
	}
	if _, answered := session.ask(context.Background(), emit, "One more?", nil); answered {
		t.Fatal("asked past the question budget")
	}
	if answerSession("no-such-session", "hi") {
		t.Fatal("answered a session that does not exist")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 50*time.Millisecond)
	defer cancel()
	other := newSession()
	defer other.close()
	if _, answered := other.ask(ctx, func(event) {}, "Anyone?", nil); answered {
		t.Fatal("a cancelled request still got an answer")
	}
}

func TestLibraryPlanFastPath(t *testing.T) {
	var sent []event
	emit := func(payload event) { sent = append(sent, payload) }
	ident := identification{Appliance: "dryer", LibraryFix: "whirlpool-electric-dryer/clothes_still_damp_long_dry_time"}
	plan := libraryPlan(ident, emit)
	if plan == nil || !strings.Contains(string(plan), `"library_problem":"clothes_still_damp_long_dry_time"`) {
		t.Fatalf("no fast-path plan: %s", plan)
	}
	if len(sent) != 2 || sent[0]["type"] != "library" {
		t.Fatalf("events: %v", sent)
	}
	ident.Brand = "Samsung"
	if libraryPlan(ident, emit) != nil {
		t.Fatal("used a Whirlpool fix for a Samsung")
	}
	// The car fix is found from however the first look names it, and keeps the model the person showed.
	camry := identification{Appliance: "car", Brand: "Toyota", ModelNumber: "2015 Camry LE 2.5L", LibraryFix: "car-oil-change/engine_oil_due_for_change"}
	plan = libraryPlan(camry, emit)
	if plan == nil || !strings.Contains(string(plan), `"model_number":"2015 Camry LE 2.5L"`) {
		t.Fatalf("car fix: %s", plan)
	}
	if normalizeAppliance("carpet cleaner") == "car" || normalizeAppliance("2015 Toyota Camry") != "car" {
		t.Fatal("car names must match on whole words")
	}
	// A top-loader with no brand on the photo gets the top-load fix, without claiming it's a Whirlpool.
	washer := identification{Appliance: "top-load washer", LibraryFix: "whirlpool-top-load-washer/not_draining_wet_clothes"}
	plan = libraryPlan(washer, emit)
	if plan == nil || !strings.Contains(string(plan), `"brand":""`) || strings.Contains(string(plan), `"model_number":"WTW`) {
		t.Fatalf("unbranded washer fix: %s", plan)
	}
	if entry := lookupLibrary(libraryQuery{"top-load washer", "", ""}); entry == nil || entry.ID != "whirlpool-top-load-washer" {
		t.Fatalf("top-load washer found %v", entry)
	}
}

func TestMatchRigWholeWords(test *testing.T) {
	if containsWords("carpet cleaner", "car") {
		test.Fatal(`"car" must not match "carpet cleaner"`)
	}
	if !containsWords("my car won't start", "car") || !containsWords("front-load washer", "front-load washer") {
		test.Fatal("whole-word phrases should match")
	}
}
