import { useEffect, useState } from 'react'

const fileInfoUrl = 'http://localhost:8080/file-info'

function formatFileSize(bytes) {
  if (bytes < 1024) return `${bytes} bytes`

  const units = ['KB', 'MB', 'GB', 'TB']
  let size = bytes
  let unitIndex = -1

  do {
    size /= 1024
    unitIndex += 1
  } while (size >= 1024 && unitIndex < units.length - 1)

  return `${size.toFixed(1)} ${units[unitIndex]}`
}

function FileInfo() {
  const [fileInfo, setFileInfo] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    const controller = new AbortController()

    async function loadFileInfo() {
      try {
        const response = await fetch(fileInfoUrl, { signal: controller.signal })
        if (!response.ok) {
          throw new Error(`파일 정보를 불러오지 못했습니다. (HTTP ${response.status})`)
        }

        setFileInfo(await response.json())
      } catch (fetchError) {
        if (fetchError.name !== 'AbortError') {
          setError(fetchError.message)
        }
      }
    }

    loadFileInfo()
    return () => controller.abort()
  }, [])

  if (error) {
    return <div className="file-info__status file-info__status--error" role="alert">{error}</div>
  }

  if (!fileInfo) {
    return <div className="file-info__status" role="status">PDF 파일 정보를 불러오는 중...</div>
  }

  return (
    <header className="file-info" aria-label="PDF 파일 정보">
      <div className="file-info__heading">
        <p className="file-info__eyebrow">PDF 문서</p>
        <p className="file-info__name" title={fileInfo.name}>{fileInfo.name}</p>
      </div>
      <div className="file-info__details">
        <span className="file-info__detail">크기 {formatFileSize(fileInfo.size)}</span>
        <span className="file-info__detail">
          수정일 {new Date(fileInfo.modTime).toLocaleString('ko-KR')}
        </span>
      </div>
    </header>
  )
}

export default FileInfo
