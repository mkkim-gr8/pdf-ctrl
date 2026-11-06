import { useCallback, useEffect, useRef, useState } from 'react'
import * as pdfjsLib from 'pdfjs-dist'
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl

function PdfPage({ container, document, pageNumber, thumbnail = false }) {
  const pageRef = useRef(null)
  const canvasRef = useRef(null)
  const [isVisible, setIsVisible] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!container || !pageRef.current) return undefined

    const observer = new IntersectionObserver(
      ([entry]) => setIsVisible(entry.isIntersecting),
      { root: container, threshold: 0.01 },
    )
    observer.observe(pageRef.current)

    return () => observer.disconnect()
  }, [container])

  useEffect(() => {
    if (!isVisible || !container) return undefined

    let cancelled = false
    let renderTask
    const canvas = canvasRef.current
    if (!canvas) return undefined

    async function renderPage() {
      try {
        const page = await document.getPage(pageNumber)
        if (cancelled) return

        const unscaledViewport = page.getViewport({ scale: 1 })
        const scale = thumbnail
          ? Math.min(88 / unscaledViewport.width, 112 / unscaledViewport.height)
          : Math.min(
              (container.clientWidth - 32) / unscaledViewport.width,
              (container.clientHeight - 32) / unscaledViewport.height,
            )
        const viewport = page.getViewport({ scale })
        const context = canvas.getContext('2d')
        const outputScale = thumbnail ? 1 : Math.min(window.devicePixelRatio || 1, 2)

        canvas.width = Math.floor(viewport.width * outputScale)
        canvas.height = Math.floor(viewport.height * outputScale)
        canvas.style.width = `${viewport.width}px`
        canvas.style.height = `${viewport.height}px`
        context.setTransform(outputScale, 0, 0, outputScale, 0, 0)

        renderTask = page.render({ canvas, canvasContext: context, viewport })
        await renderTask.promise
      } catch (renderError) {
        if (!cancelled && renderError.name !== 'RenderingCancelledException') {
          setError(renderError.message)
        }
      }
    }

    renderPage()

    return () => {
      cancelled = true
      renderTask?.cancel()
      canvas.width = 0
      canvas.height = 0
    }
  }, [container, document, isVisible, pageNumber, thumbnail])

  return (
    <article
      ref={pageRef}
      className={thumbnail ? 'pdfjs-thumbnail-page' : 'pdfjs-page'}
      data-page-number={thumbnail ? undefined : pageNumber}
      aria-label={`페이지 ${pageNumber}`}
    >
      {error ? (
        <p className="pdfjs-message pdfjs-message--error" role="alert">{error}</p>
      ) : (
        <canvas ref={canvasRef} />
      )}
    </article>
  )
}

function PdfJsViewer({ src }) {
  const [container, setContainer] = useState(null)
  const [thumbnailContainer, setThumbnailContainer] = useState(null)
  const [document, setDocument] = useState(null)
  const [error, setError] = useState('')
  const [pageInput, setPageInput] = useState('1')
  const pageInputRef = useRef(null)
  const [currentPage, setCurrentPage] = useState(1)
  const [printStatus, setPrintStatus] = useState('')

  useEffect(() => {
    if (container) container.scrollTo(0, 0)
  }, [container, document])

  useEffect(() => {
    if (!container) return undefined

    let frameId = 0
    const updateCurrentPage = () => {
      frameId = 0
      const viewport = container.getBoundingClientRect()
      let mostVisiblePage = 0
      let largestVisibleRatio = 0

      container.querySelectorAll('[data-page-number]').forEach((pageElement) => {
        const bounds = pageElement.getBoundingClientRect()
        const visibleHeight = Math.max(
          0,
          Math.min(bounds.bottom, viewport.bottom) - Math.max(bounds.top, viewport.top),
        )
        const visibleRatio = visibleHeight / bounds.height
        if (visibleRatio > largestVisibleRatio) {
          largestVisibleRatio = visibleRatio
          mostVisiblePage = Number(pageElement.dataset.pageNumber)
        }
      })

      if (mostVisiblePage > 0) {
        setCurrentPage((page) => page === mostVisiblePage ? page : mostVisiblePage)
        if (window.document.activeElement !== pageInputRef.current) {
          setPageInput(String(mostVisiblePage))
        }
      }
    }

    const handleScroll = () => {
      if (!frameId) frameId = window.requestAnimationFrame(updateCurrentPage)
    }

    container.addEventListener('scroll', handleScroll, { passive: true })
    handleScroll()
    return () => {
      container.removeEventListener('scroll', handleScroll)
      if (frameId) window.cancelAnimationFrame(frameId)
    }
  }, [container])

  const scrollThumbnailToPage = useCallback((pageNumber) => {
    if (!thumbnailContainer) return
    const activeThumbnail = thumbnailContainer.querySelector(
      `[data-thumbnail-page="${pageNumber}"]`,
    )
    if (!activeThumbnail) return

    const thumbnailBounds = activeThumbnail.getBoundingClientRect()
    const containerBounds = thumbnailContainer.getBoundingClientRect()
    const itemLeft = thumbnailBounds.left - containerBounds.left + thumbnailContainer.scrollLeft
    const itemRight = itemLeft + thumbnailBounds.width
    let left = thumbnailContainer.scrollLeft

    if (itemLeft < left) {
      left = itemLeft
    } else if (itemRight > left + thumbnailContainer.clientWidth) {
      left = itemRight - thumbnailContainer.clientWidth
    }

    if (left !== thumbnailContainer.scrollLeft) {
      thumbnailContainer.scrollTo({ left, behavior: 'smooth' })
    }
  }, [thumbnailContainer])

  useEffect(() => {
    scrollThumbnailToPage(currentPage)
  }, [currentPage, scrollThumbnailToPage])

  useEffect(() => {
    let active = true
    const loadingTask = pdfjsLib.getDocument({
      url: src,
      rangeChunkSize: 64 * 1024,
      disableStream: true,
      disableAutoFetch: true,
    })

    loadingTask.promise.then(
      (loadedDocument) => {
        if (active) {
          setCurrentPage(1)
          setPageInput('1')
          setDocument(loadedDocument)
        }
      },
      (loadError) => {
        if (active) setError(loadError.message)
      },
    )

    return () => {
      active = false
      loadingTask.destroy()
    }
  }, [src])

  const goToPage = useCallback((pageNumber) => {
    if (!container || !document) return
    const targetPage = Math.min(Math.max(1, pageNumber), document.numPages)
    const pageElement = container.querySelector(`[data-page-number="${targetPage}"]`)
    if (!pageElement) return

    const top = pageElement.getBoundingClientRect().top
      - container.getBoundingClientRect().top
      + container.scrollTop
    container.scrollTo({ top, behavior: 'auto' })
    setCurrentPage(targetPage)
    setPageInput(String(targetPage))
    scrollThumbnailToPage(targetPage)
  }, [container, document, scrollThumbnailToPage])

  function handlePageSubmit(event) {
    event.preventDefault()
    const pageNumber = Number.parseInt(pageInput, 10)
    if (Number.isInteger(pageNumber)) {
      goToPage(pageNumber)
    } else {
      setPageInput(String(currentPage))
    }
  }

  async function handlePrint() {
    setPrintStatus(`인쇄할 페이지를 준비하는 중... (0/${document.numPages})`)
    const printDocument = window.document.createElement('div')
    printDocument.className = 'pdfjs-print-document'
    window.document.body.append(printDocument)
    const printObjectUrls = []

    try {
      for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
        const page = await document.getPage(pageNumber)
        const viewport = page.getViewport({ scale: 1.5 })
        const canvas = window.document.createElement('canvas')
        const context = canvas.getContext('2d')
        if (!context) throw new Error('인쇄용 캔버스를 만들 수 없습니다.')

        canvas.width = Math.ceil(viewport.width)
        canvas.height = Math.ceil(viewport.height)
        const pageContainer = window.document.createElement('section')
        pageContainer.className = 'pdfjs-print-page'
        pageContainer.append(canvas)

        await page.render({ canvas, canvasContext: context, viewport }).promise
        const imageBlob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'))
        if (!imageBlob) throw new Error(`페이지 ${pageNumber}의 인쇄 이미지를 만들 수 없습니다.`)

        const imageUrl = window.URL.createObjectURL(imageBlob)
        printObjectUrls.push(imageUrl)
        const image = window.document.createElement('img')
        image.alt = `페이지 ${pageNumber}`
        image.src = imageUrl
        await image.decode()
        canvas.width = 0
        canvas.height = 0
        pageContainer.replaceChildren(image)
        printDocument.append(pageContainer)
        page.cleanup()

        if (pageNumber === 1 || pageNumber === document.numPages || pageNumber % 10 === 0) {
          setPrintStatus(`인쇄할 페이지를 준비하는 중... (${pageNumber}/${document.numPages})`)
        }
      }

      setPrintStatus('')
      window.addEventListener('afterprint', () => {
        printDocument.remove()
        printObjectUrls.forEach((url) => window.URL.revokeObjectURL(url))
      }, { once: true })
      window.print()
    } catch (printError) {
      printDocument.remove()
      printObjectUrls.forEach((url) => window.URL.revokeObjectURL(url))
      setPrintStatus(`인쇄 준비에 실패했습니다: ${printError.message}`)
    }
  }

  if (error) {
    return <div className="pdfjs-message pdfjs-message--error" role="alert">{error}</div>
  }

  if (!document) {
    return <div className="pdfjs-message" role="status">PDF를 불러오는 중...</div>
  }

  return (
    <div className="pdfjs-shell">
      <div className="pdfjs-toolbar" aria-label="PDF 페이지 컨트롤">
        <button
          type="button"
          className="pdfjs-control"
          aria-label="이전 페이지"
          disabled={currentPage <= 1}
          onClick={() => goToPage(currentPage - 1)}
        >
          이전
        </button>
        <form className="pdfjs-page-form" onSubmit={handlePageSubmit}>
          <label htmlFor="pdf-page-number">페이지</label>
          <input
            id="pdf-page-number"
            ref={pageInputRef}
            type="number"
            min="1"
            max={document.numPages}
            value={pageInput}
            onChange={(event) => setPageInput(event.target.value)}
            aria-label="이동할 페이지 번호"
          />
          <span>/ {document.numPages}</span>
          <button type="submit" className="pdfjs-control">이동</button>
        </form>
        <button
          type="button"
          className="pdfjs-control"
          aria-label="다음 페이지"
          disabled={currentPage >= document.numPages}
          onClick={() => goToPage(currentPage + 1)}
        >
          다음
        </button>
        <button
          type="button"
          className="pdfjs-control pdfjs-print"
          disabled={Boolean(printStatus && printStatus.startsWith('인쇄할 페이지를 준비하는 중'))}
          onClick={handlePrint}
        >
          인쇄
        </button>
      </div>
      {printStatus && (
        <p className="pdfjs-print-status" role="status" aria-live="polite">
          {printStatus}
        </p>
      )}

      <div className="pdfjs-content">
        <nav ref={setThumbnailContainer} className="pdfjs-thumbnails" aria-label="PDF 페이지 썸네일">
          {thumbnailContainer && Array.from({ length: document.numPages }, (_, index) => {
            const pageNumber = index + 1
            return (
              <button
                key={pageNumber}
                type="button"
                className={`pdfjs-thumbnail${currentPage === pageNumber ? ' is-active' : ''}`}
                data-thumbnail-page={pageNumber}
                aria-label={`${pageNumber}페이지로 이동`}
                aria-current={currentPage === pageNumber ? 'page' : undefined}
                onClick={() => goToPage(pageNumber)}
              >
                <PdfPage
                  container={thumbnailContainer}
                  document={document}
                  pageNumber={pageNumber}
                  thumbnail
                />
                <span>{pageNumber}</span>
              </button>
            )
          })}
        </nav>

        <div ref={setContainer} className="pdfjs-viewer">
          {container && Array.from({ length: document.numPages }, (_, index) => (
            <PdfPage
              key={index + 1}
              container={container}
              document={document}
              pageNumber={index + 1}
            />
          ))}
        </div>
      </div>
    </div>
  )
}

export default PdfJsViewer
