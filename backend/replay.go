package main

import (
	"bufio"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"
)

// replayDir, when set, makes the API play back recorded agent runs instead of calling Meta,
// so the UI can be tested end to end for free. Fixtures are SSE files named after the appliance.
var replayDir = os.Getenv("HELPA_REPLAY")

var replayPause = map[string]time.Duration{
	"say": 900 * time.Millisecond, "search": 500 * time.Millisecond, "library": 600 * time.Millisecond,
	"parts": 700 * time.Millisecond, "plan": 1200 * time.Millisecond, "model": 1500 * time.Millisecond,
	"step_parts": 200 * time.Millisecond, "status": 300 * time.Millisecond,
}

func replayFixture(complaint string) (string, error) {
	paths, err := filepath.Glob(filepath.Join(replayDir, "*.sse"))
	if err != nil || len(paths) == 0 {
		return "", fmt.Errorf("no fixtures in %s", replayDir)
	}
	lowered := strings.ToLower(complaint)
	for _, path := range paths {
		if strings.Contains(lowered, strings.TrimSuffix(filepath.Base(path), ".sse")) {
			return path, nil
		}
	}
	return paths[0], nil
}

func replayFix(writer http.ResponseWriter, request *http.Request, complaint string, emit func(event)) {
	path, err := replayFixture(complaint)
	if err != nil {
		emit(event{"type": "error", "message": err.Error()})
		return
	}
	file, err := os.Open(path)
	if err != nil {
		emit(event{"type": "error", "message": err.Error()})
		return
	}
	defer file.Close()
	scanner := bufio.NewScanner(file)
	scanner.Buffer(make([]byte, 0, 1<<20), 32<<20)
	for scanner.Scan() {
		line, found := strings.CutPrefix(scanner.Text(), "data: ")
		if !found {
			continue
		}
		var recorded event
		if json.Unmarshal([]byte(line), &recorded) != nil || recorded["type"] == "done" {
			continue
		}
		select {
		case <-request.Context().Done():
			return
		case <-time.After(replayPause[fmt.Sprint(recorded["type"])]):
		}
		emit(recorded)
	}
}

var replayChecks = 0

func replayCheck(writer http.ResponseWriter) {
	replayChecks++
	result := map[string]any{"done": false, "feedback": "Almost! The screen is still a little crooked, so slide it all the way down."}
	if replayChecks%2 == 0 {
		result = map[string]any{"done": true, "feedback": "That looks perfect. Nice work!"}
	}
	time.Sleep(1500 * time.Millisecond)
	writer.Header().Set("Content-Type", "application/json")
	json.NewEncoder(writer).Encode(result)
}

func replayTranscribe(writer http.ResponseWriter) {
	time.Sleep(800 * time.Millisecond)
	writer.Header().Set("Content-Type", "application/json")
	json.NewEncoder(writer).Encode(map[string]string{"text": "My Whirlpool dryer takes forever to dry"})
}
