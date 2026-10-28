package main

import (
	"bytes"
	"encoding/json"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func locateRequest(t *testing.T, phrases ...string) *httptest.ResponseRecorder {
	t.Helper()
	var body bytes.Buffer
	form := multipart.NewWriter(&body)
	for _, phrase := range phrases {
		form.WriteField("phrase", phrase)
	}
	form.Close()
	request := httptest.NewRequest(http.MethodPost, "/api/locate", &body)
	request.Header.Set("Content-Type", form.FormDataContentType())
	recorder := httptest.NewRecorder()
	handleLocate(recorder, request)
	return recorder
}

func TestLocateReplay(t *testing.T) {
	saved := replayDir
	replayDir = "fixtures"
	defer func() { replayDir = saved }()

	if code := locateRequest(t, "  ", strings.Repeat("x", 61)).Code; code != http.StatusBadRequest {
		t.Fatalf("blank and overlong phrases should be rejected, got %d", code)
	}
	recorder := locateRequest(t, "dish rack", "rack")
	var reply struct{ Sam, Phrase string }
	if err := json.Unmarshal(recorder.Body.Bytes(), &reply); err != nil {
		t.Fatal(err)
	}
	if reply.Phrase != "dish rack" || !strings.Contains(reply.Sam, "<|mask") {
		t.Fatalf("replay locate returned %q with %d bytes of SAM text", reply.Phrase, len(reply.Sam))
	}
}
