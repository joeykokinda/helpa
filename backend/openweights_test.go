package main

import (
	"encoding/json"
	"testing"
)

func TestParseOpenCheck(t *testing.T) {
	good := "Looking at the photo...\n```json\n{\"status\": \"completed\", \"done\": false, \"evidence\": \"screen is out\", \"feedback\": \"Nice, it's out.\", \"mistake\": \"\"}\n```"
	raw, err := parseOpenCheck(good)
	if err != nil {
		t.Fatal(err)
	}
	var result map[string]any
	json.Unmarshal(raw, &result)
	if result["status"] != "COMPLETED" || result["done"] != true {
		t.Errorf("done must follow a COMPLETED status: %v", result)
	}
	for _, bad := range []string{"no json here", `{"status": "MAYBE", "feedback": "hm"}`, `{"status": "INCOMPLETE", "feedback": ""}`} {
		if _, err := parseOpenCheck(bad); err == nil {
			t.Errorf("accepted %q", bad)
		}
	}
}
