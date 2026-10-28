package main

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestAskNeedsAQuestion(t *testing.T) {
	for _, body := range []string{`{}`, `{"question":"   "}`, `not json`} {
		recorder := httptest.NewRecorder()
		handleAsk(recorder, httptest.NewRequest("POST", "/api/ask", strings.NewReader(body)))
		if recorder.Code != http.StatusBadRequest {
			t.Errorf("%s: got %d, want 400", body, recorder.Code)
		}
	}
}
