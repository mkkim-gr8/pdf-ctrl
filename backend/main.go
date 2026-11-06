package main

import (
	"fmt"
	"net/http"
	"os"

	"github.com/gin-gonic/gin"
)

const pdfFilePath = "./sample.pdf"

type pdfFileMetadata struct {
	Name    string `json:"name"`
	Size    int64  `json:"size"`
	ModTime string `json:"modTime"`
}

func main() {
	fmt.Println("Starting server on :8080")
	if err := newRouter().Run(":8080"); err != nil {
		fmt.Println("Error starting server:", err)
	}
}

func newRouter() *gin.Engine {
	router := gin.Default()
	router.Use(func(c *gin.Context) {
		origin := c.GetHeader("Origin")
		if origin == "http://localhost:5173" || origin == "http://127.0.0.1:5173" {
			c.Header("Access-Control-Allow-Origin", origin)
			c.Header("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS")
			c.Header("Access-Control-Allow-Headers", "Range, If-Range")
			c.Header("Access-Control-Expose-Headers", "Accept-Ranges, Content-Length, Content-Range, Content-Type")
			c.Header("Vary", "Origin")
		}

		if c.Request.Method == http.MethodOptions {
			c.AbortWithStatus(http.StatusNoContent)
			return
		}

		c.Next()
	})
	router.GET("/stream/pdf", pdfStreamHandler)
	router.HEAD("/stream/pdf", pdfStreamHandler)
	router.GET("/file-info", pdfFileInfoHandler)

	return router
}

func pdfFileInfoHandler(c *gin.Context) {
	fileInfo, err := os.Stat(pdfFilePath)
	if err != nil {
		c.String(http.StatusNotFound, "파일을 찾을 수 없습니다.")
		return
	}

	c.JSON(http.StatusOK, pdfFileMetadata{
		Name:    fileInfo.Name(),
		Size:    fileInfo.Size(),
		ModTime: fileInfo.ModTime().Format(http.TimeFormat),
	})
}

func pdfStreamHandler(c *gin.Context) {

	// 1. PDF 파일 열기
	file, err := os.Open(pdfFilePath)
	if err != nil {
		c.String(http.StatusNotFound, "파일을 찾을 수 없습니다.")
		return
	}
	defer file.Close()

	// 2. 파일 정보 가져오기 (용량 확인용)
	fileInfo, err := file.Stat()
	if err != nil {
		c.String(http.StatusInternalServerError, "파일 정보를 읽을 수 없습니다.")
		return
	}

	// 브라우저 내 표시와 PDF 뷰어의 byte-range 요청을 지원한다.
	c.Header("Content-Type", "application/pdf")
	c.Header("Content-Disposition", "inline; filename=\"streamed_document.pdf\"")
	c.Header("X-Content-Type-Options", "nosniff")
	http.ServeContent(c.Writer, c.Request, "streamed_document.pdf", fileInfo.ModTime(), file)
}
