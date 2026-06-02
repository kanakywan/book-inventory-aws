import { useEffect, useState } from 'react'
import { fetchAuthSession } from 'aws-amplify/auth'

const API_URL = import.meta.env.VITE_API_URL

function App() {
  const [books, setBooks] = useState([])
  const [file, setFile] = useState(null)
  const [scanResult, setScanResult] = useState(null)
  const [form, setForm] = useState({
    bookId: '',
    title: '',
    publisher: '',
    edition: '',
    category: '',
    coverImageKey: '',
    status: 'Tenho',
  })
  const [search, setSearch] = useState('')
  const [matches, setMatches] = useState([])

  async function getToken() {
    const session = await fetchAuthSession()
    return session.tokens.idToken.toString()
  }

  async function api(path, options = {}) {
    const token = await getToken()

    const response = await fetch(`${API_URL}${path}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        ...(options.headers || {}),
      },
    })

    return response.json()
  }

  async function loadBooks() {
    const result = await api('/books')
    setBooks(result.books || [])
  }

  useEffect(() => {
    loadBooks()
  }, [])

  async function handleScan() {
    if (!file) {
      alert('Escolha uma foto da capa primeiro.')
      return
    }

    const uploadData = await api('/books/upload-url', {
      method: 'POST',
      body: JSON.stringify({
        contentType: file.type,
      }),
    })

    await fetch(uploadData.uploadUrl, {
      method: 'PUT',
      headers: {
        'Content-Type': file.type,
      },
      body: file,
    })

    const scanData = await api('/books/scan', {
      method: 'POST',
      body: JSON.stringify({
        imageKey: uploadData.imageKey,
      }),
    })

    setScanResult(scanData)

    setForm({
      bookId: uploadData.bookId,
      title: scanData.suggestion?.title || '',
      publisher: scanData.suggestion?.publisher || '',
      edition: scanData.suggestion?.edition || '',
      category: scanData.suggestion?.category || '',
      coverImageKey: uploadData.imageKey,
      status: 'Tenho',
    })
  }

  async function saveBook() {
    if (!form.title) {
      alert('Informe o título.')
      return
    }

    await api('/books', {
      method: 'POST',
      body: JSON.stringify(form),
    })

    alert('Livro cadastrado com sucesso!')
    setFile(null)
    setScanResult(null)
    setForm({
      bookId: '',
      title: '',
      publisher: '',
      edition: '',
      category: '',
      coverImageKey: '',
      status: 'Tenho',
    })

    loadBooks()
  }

  async function searchBook() {
    const result = await api(`/books/search?q=${encodeURIComponent(search)}`)
    setMatches(result.matches || [])
  }

  async function deleteBook(bookId) {
    if (!confirm('Deseja remover este livro?')) return

    await api(`/books/${bookId}`, {
      method: 'DELETE',
    })

    loadBooks()
  }

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: 24, fontFamily: 'Arial' }}>
      <h1>Minha Biblioteca</h1>
      <p>Cadastre seus livros por foto e evite comprar repetido.</p>

      <hr />

      <h2>Cadastrar livro por foto</h2>

      <input
        type="file"
        accept="image/jpeg,image/png"
        capture="environment"
        onChange={(e) => setFile(e.target.files[0])}
      />

      <br />
      <br />

      <button onClick={handleScan}>Ler capa do livro</button>

      {scanResult && (
        <div>
          <h3>Texto detectado</h3>
          <ul>
            {(scanResult.detectedText || []).map((line, index) => (
              <li key={index}>{line}</li>
            ))}
          </ul>

          <h3>Confirme os dados</h3>

          <label>Título</label>
          <input
            style={{ display: 'block', width: '100%', marginBottom: 8 }}
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
          />

          <label>Editora</label>
          <input
            style={{ display: 'block', width: '100%', marginBottom: 8 }}
            value={form.publisher}
            onChange={(e) => setForm({ ...form, publisher: e.target.value })}
          />

          <label>Edição</label>
          <input
            style={{ display: 'block', width: '100%', marginBottom: 8 }}
            value={form.edition}
            onChange={(e) => setForm({ ...form, edition: e.target.value })}
          />

          <label>Categoria</label>
          <input
            style={{ display: 'block', width: '100%', marginBottom: 8 }}
            value={form.category}
            onChange={(e) => setForm({ ...form, category: e.target.value })}
          />

          <button onClick={saveBook}>Salvar livro</button>
        </div>
      )}

      <hr />

      <h2>Pesquisar antes de comprar</h2>

      <input
        placeholder="Digite parte do título"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        style={{ width: '70%', marginRight: 8 }}
      />

      <button onClick={searchBook}>Pesquisar</button>

      {matches.length > 0 && (
        <div>
          <h3>Você já pode ter esse livro:</h3>
          <ul>
            {matches.map((book) => (
              <li key={book.bookId}>
                <strong>{book.title}</strong> — {book.publisher}
              </li>
            ))}
          </ul>
        </div>
      )}

      {matches.length === 0 && search && (
        <p>Nenhum resultado encontrado para essa busca.</p>
      )}

      <hr />

      <h2>Livros cadastrados</h2>

      {books.length === 0 && <p>Nenhum livro cadastrado ainda.</p>}

      <ul>
        {books.map((book) => (
          <li key={book.bookId} style={{ marginBottom: 12 }}>
            <strong>{book.title}</strong>
            <br />
            Editora: {book.publisher || '-'} | Categoria: {book.category || '-'}
            <br />
            <button onClick={() => deleteBook(book.bookId)}>Remover</button>
          </li>
        ))}
      </ul>
    </div>
  )
}

export default App
