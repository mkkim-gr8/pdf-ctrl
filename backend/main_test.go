package main

import (
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"testing"
)

func TestPDFStreamSupportsRangeRequests(t *testing.T) {
	request := httptest.NewRequest(http.MethodGet, "/stream/pdf", nil)
	request.Header.Set("Origin", "http://localhost:5173")
	request.Header.Set("Range", "bytes=0-63")
	response := httptest.NewRecorder()

	newRouter().ServeHTTP(response, request)

	if response.Code != http.StatusPartialContent {
		t.Fatalf("status = %d, want %d", response.Code, http.StatusPartialContent)
	}
	fileInfo, err := os.Stat("./sample.pdf")
	if err != nil {
		t.Fatal(err)
	}
	wantContentRange := fmt.Sprintf("bytes 0-63/%d", fileInfo.Size())
	if got := response.Header().Get("Content-Range"); got != wantContentRange {
		t.Errorf("Content-Range = %q, want %q", got, wantContentRange)
	}
	if got := response.Header().Get("Accept-Ranges"); got != "bytes" {
		t.Errorf("Accept-Ranges = %q, want %q", got, "bytes")
	}
	if got := response.Header().Get("Access-Control-Allow-Origin"); got != "http://localhost:5173" {
		t.Errorf("Access-Control-Allow-Origin = %q, want %q", got, "http://localhost:5173")
	}
	if response.Body.Len() != 64 {
		t.Errorf("response body length = %d, want 64", response.Body.Len())
	}
}

func TestPDFFileInfoReturnsFileMetadata(t *testing.T) {
	request := httptest.NewRequest(http.MethodGet, "/file-info", nil)
	request.Header.Set("Origin", "http://localhost:5173")
	response := httptest.NewRecorder()

	newRouter().ServeHTTP(response, request)

	if response.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d", response.Code, http.StatusOK)
	}

	var metadata pdfFileMetadata
	if err := json.Unmarshal(response.Body.Bytes(), &metadata); err != nil {
		t.Fatal(err)
	}
	fileInfo, err := os.Stat(pdfFilePath)
	if err != nil {
		t.Fatal(err)
	}
	if metadata.Name != fileInfo.Name() {
		t.Errorf("name = %q, want %q", metadata.Name, fileInfo.Name())
	}
	if metadata.Size != fileInfo.Size() {
		t.Errorf("size = %d, want %d", metadata.Size, fileInfo.Size())
	}
	if metadata.ModTime == "" {
		t.Error("modTime is empty")
	}
	if got := response.Header().Get("Access-Control-Allow-Origin"); got != "http://localhost:5173" {
		t.Errorf("Access-Control-Allow-Origin = %q, want %q", got, "http://localhost:5173")
	}
}

func TestPDFStreamPreflightAllowsRangeRequests(t *testing.T) {
	request := httptest.NewRequest(http.MethodOptions, "/stream/pdf", nil)
	request.Header.Set("Origin", "http://localhost:5173")
	request.Header.Set("Access-Control-Request-Method", "GET")
	request.Header.Set("Access-Control-Request-Headers", "range")
	response := httptest.NewRecorder()

	newRouter().ServeHTTP(response, request)

	if response.Code != http.StatusNoContent {
		t.Fatalf("status = %d, want %d", response.Code, http.StatusNoContent)
	}
	if got := response.Header().Get("Access-Control-Allow-Headers"); got != "Range, If-Range" {
		t.Errorf("Access-Control-Allow-Headers = %q, want %q", got, "Range, If-Range")
	}
}
