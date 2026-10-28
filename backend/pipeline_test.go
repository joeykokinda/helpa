package main

import (
	"context"
	"encoding/json"
	"io"
	"net/http/httptest"
	"net/url"
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
	plan := libraryPlan(ident, "", nil, emit)
	if plan == nil || !strings.Contains(string(plan), `"library_problem":"clothes_still_damp_long_dry_time"`) {
		t.Fatalf("no fast-path plan: %s", plan)
	}
	if len(sent) != 2 || sent[0]["type"] != "library" {
		t.Fatalf("events: %v", sent)
	}
	ident.Brand = "Samsung"
	if libraryPlan(ident, "", nil, emit) != nil {
		t.Fatal("used a Whirlpool fix for a Samsung")
	}
	// The car fix is found from however the first look names it, and keeps the model the person showed.
	camry := identification{Appliance: "car", Brand: "Toyota", ModelNumber: "2015 Camry LE 2.5L", LibraryFix: "car-oil-change/engine_oil_due_for_change"}
	plan = libraryPlan(camry, "", nil, emit)
	if plan == nil || !strings.Contains(string(plan), `"model_number":"2015 Camry LE 2.5L"`) {
		t.Fatalf("car fix: %s", plan)
	}
	if normalizeAppliance("carpet cleaner") == "car" || normalizeAppliance("2015 Toyota Camry") != "car" {
		t.Fatal("car names must match on whole words")
	}
	// A top-loader with no brand on the photo gets the top-load fix, without claiming it's a Whirlpool.
	washer := identification{Appliance: "top-load washer", LibraryFix: "whirlpool-top-load-washer/not_draining_wet_clothes"}
	plan = libraryPlan(washer, "", nil, emit)
	if plan == nil || !strings.Contains(string(plan), `"brand":""`) || strings.Contains(string(plan), `"model_number":"WTW`) {
		t.Fatalf("unbranded washer fix: %s", plan)
	}
	if entry := lookupLibrary(libraryQuery{"top-load washer", "", ""}); entry == nil || entry.ID != "whirlpool-top-load-washer" {
		t.Fatalf("top-load washer found %v", entry)
	}
}

func TestLibraryContradiction(t *testing.T) {
	emit := func(event) {}
	burner := identification{Appliance: "electric range", LibraryFix: "whirlpool-electric-range/one_burner_will_not_heat"}
	if libraryPlan(burner, "one of the burners on my stove doesn't heat", nil, emit) == nil {
		t.Fatal("a plain burner complaint should get the library fix")
	}
	if libraryPlan(burner, "one of the coil burners on my electric stove doesn't heat", nil, emit) != nil {
		t.Fatal("coil burners must not get the glass-top fix")
	}
	if !rigContradicted("range_electric", "my gas stove won't light") || rigContradicted("range_electric", "my oven light is out") {
		t.Fatal("the glass-top range model is for electric ranges only")
	}
	if rigContradicted("dryer_top_vent", "my gas dryer takes forever") {
		t.Fatal("a gas dryer still has the same lint screen and vent")
	}
}

func TestHypothesisChain(t *testing.T) {
	lint := "whirlpool-electric-dryer/clothes_still_damp_long_dry_time"
	vent := "whirlpool-electric-dryer/vent_blocked"
	fuse := "whirlpool-electric-dryer/thermal_fuse_or_heater"
	if next := nextFix([]string{lint}); next != vent {
		t.Fatalf("after the lint screen: %q", next)
	}
	if next := nextFix([]string{lint, vent}); next != fuse {
		t.Fatalf("after the vent: %q", next)
	}
	if next := nextFix([]string{lint, vent, fuse}); next != "" {
		t.Fatalf("the chain should end after the fuse, got %q", next)
	}
	// Starting from the sensor strips still skips the vent once it's been tried.
	if next := nextFix([]string{vent, "whirlpool-electric-dryer/dryer_stops_before_clothes_are_dry"}); next != fuse {
		t.Fatalf("an already-ruled-out vent was offered again: %q", next)
	}
	if nextFix(nil) != "" || nextFix([]string{"no-such/fix"}) != "" {
		t.Fatal("nothing tried means no next cause")
	}
	// A ruled-out fix is never the plan again, even when the first look names it.
	ident := identification{Appliance: "electric dryer", LibraryFix: lint}
	if libraryPlan(ident, "still damp", []string{lint}, func(event) {}) != nil {
		t.Fatal("offered the lint screen again after it didn't work")
	}
	ident.LibraryFix = vent
	plan := libraryPlan(ident, "", []string{lint}, func(event) {})
	if !strings.Contains(string(plan), `"cause":"a blocked dryer vent"`) {
		t.Fatalf("the next plan should say what it rules out: %s", plan)
	}
	// Every link in the library points at a fix that exists.
	for _, entry := range library {
		for _, problem := range entry.Problems {
			if problem.Next == "" {
				continue
			}
			if _, next := findLibraryFix(entry.ID + "/" + problem.Next); next == nil {
				t.Errorf("%s/%s points at missing %s", entry.ID, problem.ID, problem.Next)
			}
		}
	}
}

func TestSafetyStop(t *testing.T) {
	// The microwave miss from the eval: the model called a pro over a high-voltage part but didn't set the flag.
	microwave := `{"diagnosis":"The heating part inside has failed.","safety":["Do not open the back.","Microwaves can hold a dangerous charge even when unplugged."],` +
		`"steps":[{"instruction":"Heat one cup of water","details":[]},{"instruction":"If it stays cold, call a pro","details":[]}],"stop_for_pro":false}`
	if !strings.Contains(string(markSafetyStop(json.RawMessage(microwave))), `"stop_for_pro":true`) {
		t.Fatal("a high-voltage hand-off to a pro must be a safety stop")
	}
	// Handing a job to a pro isn't a safety stop unless the person themselves is in danger.
	fuse := `{"diagnosis":"The thermal fuse blew.","safety":["The fix means opening the back panel near 240-volt wiring, so leave it to a pro."],` +
		`"steps":[{"instruction":"Call a pro, or order the part","details":[]}],"stop_for_pro":false}`
	if strings.Contains(string(markSafetyStop(json.RawMessage(fuse))), `"stop_for_pro":true`) {
		t.Fatal("a part swap for a pro still shows its animation")
	}
	// The coil burner from the eval: warnings about sparks and a pro as the fallback still leave a DIY fix.
	coil := `{"diagnosis":"The coil burned out.","safety":["Do not touch wiring - call a pro for that.","Stop and call a pro if you see sparks or a burning smell."],` +
		`"steps":[{"instruction":"Push new matching coil firmly into socket","details":[]},{"instruction":"Run a short heat test with water pan","details":["If it still stays cold, call a pro about the socket."]}]}`
	if strings.Contains(string(markSafetyStop(json.RawMessage(coil))), `"stop_for_pro":true`) {
		t.Fatal("a coil swap with a pro as the fallback is not a safety stop")
	}
	// A hazard the person can deal with themselves (the last step isn't a pro) stays a normal fix.
	foil := `{"diagnosis":"Foil is sparking.","safety":["Sparks can damage the oven."],"steps":[{"instruction":"Take the foil out","details":[]}]}`
	if strings.Contains(string(markSafetyStop(json.RawMessage(foil))), `"stop_for_pro":true`) {
		t.Fatal("removing foil is a fix, not a safety stop")
	}
	// Only the fixes that really are stops in the library get marked.
	for _, entry := range library {
		for _, problem := range entry.Problems {
			var before, after struct {
				Stop bool `json:"stop_for_pro"`
			}
			json.Unmarshal(problem.Plan, &before)
			json.Unmarshal(markSafetyStop(problem.Plan), &after)
			if after.Stop && !before.Stop {
				t.Errorf("%s/%s became a safety stop", entry.ID, problem.ID)
			}
		}
	}
	burning := identification{Appliance: "electric dryer", LibraryFix: "whirlpool-electric-dryer/vent_blocked"}
	if libraryPlan(burning, "dryer top gets really hot and there's a burning smell", nil, func(event) {}) != nil {
		t.Fatal("a burning smell must get a full look, not the ready vent fix")
	}
}

func TestReadFollowUp(t *testing.T) {
	form := url.Values{"ruled_out": {"whirlpool-electric-dryer/clothes_still_damp_long_dry_time, ../etc/passwd,made/up"}, "tried": {strings.Repeat("x", 1000)}}
	request := httptest.NewRequest("POST", "/api/fix", strings.NewReader(form.Encode()))
	request.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	follow := readFollowUp(request)
	if len(follow.RuledOut) != 1 || follow.RuledOut[0] != "whirlpool-electric-dryer/clothes_still_damp_long_dry_time" {
		t.Fatalf("only real library fixes are kept: %v", follow.RuledOut)
	}
	if len(follow.Tried) != 400 {
		t.Fatalf("tried text is capped, got %d", len(follow.Tried))
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
