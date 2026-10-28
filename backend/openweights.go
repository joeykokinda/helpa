package main

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"strings"
	"time"
)

// Muse Spark Open, Meta's open-weight model, served by Baseten. With BASETEN_API_KEY set, "check my work" runs on
// it first and falls back to Muse Spark on the Meta API when it fails.
var (
	openWeightsKey   = os.Getenv("BASETEN_API_KEY")
	openWeightsURL   = envOr("HELPA_OPEN_WEIGHTS_URL", "https://inference.baseten.co/v1/chat/completions")
	openWeightsModel = envOr("HELPA_OPEN_WEIGHTS_MODEL", "meta-models/muse-spark-open-1026")
)

func envOr(name, fallback string) string {
	if value := strings.TrimSpace(os.Getenv(name)); value != "" {
		return value
	}
	return fallback
}

const openCheckFormat = `Reply with only a JSON object, no other text:
{"status": "COMPLETED" | "INCOMPLETE" | "UNCERTAIN", "done": true only when COMPLETED,
 "evidence": "what in the photo shows it, a few words", "feedback": "one short, kind spoken sentence",
 "mistake": "empty unless they hold the wrong part or make the wrong move; then one short correction"}`

// checkStepOpen asks Muse Spark Open whether the photo shows the step done, in the same shape as checkStep.
func checkStepOpen(ctx context.Context, photo, prompt string) (json.RawMessage, error) {
	body, _ := json.Marshal(map[string]any{
		"model":       openWeightsModel,
		"temperature": 0.2,
		"max_tokens":  1200,
		"messages": []any{
			map[string]any{"role": "system", "content": "You check a beginner's home repair step from a photo. " + openCheckFormat},
			map[string]any{"role": "user", "content": []any{
				map[string]any{"type": "text", "text": prompt},
				map[string]any{"type": "image_url", "image_url": map[string]string{"url": photo}},
			}},
		},
	})
	ctx, cancel := context.WithTimeout(ctx, 25*time.Second)
	defer cancel()
	request, err := http.NewRequestWithContext(ctx, http.MethodPost, openWeightsURL, bytes.NewReader(body))
	if err != nil {
		return nil, err
	}
	request.Header.Set("Authorization", "Api-Key "+openWeightsKey)
	request.Header.Set("Content-Type", "application/json")
	reply, err := http.DefaultClient.Do(request)
	if err != nil {
		return nil, err
	}
	defer reply.Body.Close()
	data, _ := io.ReadAll(io.LimitReader(reply.Body, 1<<20))
	if reply.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("muse spark open %d: %s", reply.StatusCode, clip(string(data), 200))
	}
	var completion struct {
		Choices []struct {
			Message struct {
				Content string `json:"content"`
			} `json:"message"`
		} `json:"choices"`
	}
	if err := json.Unmarshal(data, &completion); err != nil || len(completion.Choices) == 0 {
		return nil, fmt.Errorf("muse spark open: unreadable reply")
	}
	return parseOpenCheck(completion.Choices[0].Message.Content)
}

// parseOpenCheck pulls the JSON object out of the model's reply (it may wrap it in a code fence or reasoning)
// and keeps it only when it has a valid status, so a bad answer falls back to Muse Spark instead of misleading.
func parseOpenCheck(content string) (json.RawMessage, error) {
	start, end := strings.Index(content, "{"), strings.LastIndex(content, "}")
	if start < 0 || end <= start {
		return nil, fmt.Errorf("muse spark open: no JSON in reply")
	}
	var result struct {
		Status   string `json:"status"`
		Done     bool   `json:"done"`
		Evidence string `json:"evidence"`
		Feedback string `json:"feedback"`
		Mistake  string `json:"mistake"`
	}
	if err := json.Unmarshal([]byte(content[start:end+1]), &result); err != nil {
		return nil, fmt.Errorf("muse spark open: %w", err)
	}
	result.Status = strings.ToUpper(strings.TrimSpace(result.Status))
	if result.Status != "COMPLETED" && result.Status != "INCOMPLETE" && result.Status != "UNCERTAIN" {
		return nil, fmt.Errorf("muse spark open: status %q", result.Status)
	}
	// Never a false "done": done follows the status, whatever the model put there.
	result.Done = result.Status == "COMPLETED"
	if strings.TrimSpace(result.Feedback) == "" {
		return nil, fmt.Errorf("muse spark open: no feedback")
	}
	out, _ := json.Marshal(map[string]any{"status": result.Status, "done": result.Done, "evidence": result.Evidence,
		"feedback": result.Feedback, "mistake": result.Mistake, "model": "muse-spark-open"})
	return out, nil
}
