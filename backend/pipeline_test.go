package main

import (
	"context"
	"strings"
	"testing"
	"time"
)

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
}
