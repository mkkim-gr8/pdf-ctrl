import FileInfo from './FileInfo.jsx'
import PdfJsViewer from './PdfJsViewer.jsx'
import './App.css'

const pdfSource = 'http://localhost:8080/stream/pdf'

function App() {
  return (
    <main className="app">
      <FileInfo />
      <section className="pdf-viewer">
        <PdfJsViewer src={pdfSource} />
      </section>
    </main>
  )
}

export default App
