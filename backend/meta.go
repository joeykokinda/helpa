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
)

const metaBaseURL = "https://api.meta.ai/v1"

var metaAPIKey = os.Getenv("META_API_KEY")

type outputItem struct {
	Type      string          `json:"type"`
	Name      string          `json:"name"`
	CallID    string          `json:"call_id"`
	Arguments string          `json:"arguments"`
	Action    json.RawMessage `json:"action"`
	Content   []struct {
		Type string `json:"type"`
		Text string `json:"text"`
	} `json:"content"`
	raw json.RawMessage
}

func (item *outputItem) UnmarshalJSON(data []byte) error {
	type plain outputItem
	if err := json.Unmarshal(data, (*plain)(item)); err != nil {
		return err
	}
	item.raw = append(json.RawMessage(nil), data...)
	return nil
}

func (item outputItem) text() string {
	var parts []string
	for _, part := range item.Content {
		if part.Type == "output_text" {
			parts = append(parts, part.Text)
		}
	}
	return strings.Join(parts, "")
}

type response struct {
	Output []outputItem `json:"output"`
	Error  *struct {
		Message string `json:"message"`
	} `json:"error"`
}

func (r response) text() string {
	var parts []string
	for _, item := range r.Output {
		if item.Type == "message" {
			parts = append(parts, item.text())
		}
	}
	return strings.Join(parts, "")
}

func createResponse(ctx context.Context, body map[string]any) (response, error) {
	payload, err := json.Marshal(body)
	if err != nil {
		return response{}, err
	}
	request, err := http.NewRequestWithContext(ctx, http.MethodPost, metaBaseURL+"/responses", bytes.NewReader(payload))
	if err != nil {
		return response{}, err
	}
	request.Header.Set("Authorization", "Bearer "+metaAPIKey)
	request.Header.Set("Content-Type", "application/json")
	reply, err := http.DefaultClient.Do(request)
	if err != nil {
		return response{}, err
	}
	defer reply.Body.Close()
	data, err := io.ReadAll(reply.Body)
	if err != nil {
		return response{}, err
	}
	if reply.StatusCode != http.StatusOK {
		return response{}, fmt.Errorf("meta api %d: %s", reply.StatusCode, data)
	}
	var parsed response
	if err := json.Unmarshal(data, &parsed); err != nil {
		return response{}, err
	}
	if parsed.Error != nil {
		return response{}, fmt.Errorf("meta api: %s", parsed.Error.Message)
	}
	return parsed, nil
}

func userMessage(text string, imageURLs ...string) map[string]any {
	content := []map[string]any{{"type": "input_text", "text": text}}
	for _, url := range imageURLs {
		content = append(content, map[string]any{"type": "input_image", "image_url": url})
	}
	return map[string]any{"type": "message", "role": "user", "content": content}
}

// segment returns SAM 3.1's raw box/mask text; the phone decodes it with @meta-sam/parser.
func segment(ctx context.Context, imageURL, phrase string) (string, error) {
	reply, err := createResponse(ctx, map[string]any{
		"model": "sam-3.1",
		"input": []any{userMessage(phrase, imageURL)},
	})
	if err != nil {
		return "", err
	}
	return reply.text(), nil
}
