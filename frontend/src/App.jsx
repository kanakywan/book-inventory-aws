import { useEffect, useState } from 'react'
import { fetchAuthSession, signOut } from 'aws-amplify/auth'

const API_URL = import.meta.env.VITE_API_URL

function App() {
  const [books, setBooks] = useState([])
  const [file, setFile] = useState(null)
  const [scanResult, setScanResult] = useState(null)
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [search, setSearch] = useState('')
  const [matches, setMatches] = useState([])

  const [form, setForm] = useState({
    bookId: '',
    title: '',
    publisher: '',
    edition: '',
    category: '',
    coverImageKey: '',
    status: 'Tenho',
  })

  async function getToken() {
    const session = await fetchAuthSession()

    if (!session.tokens?.idToken) {
      throw new Error('Sessão inválida. Faça login novamente.')
    }

    return session.tokens.idToken.toString()
  }

  async function api(path, options = {}) {
    if (!API_URL) {
      throw new Error('VITE_API_URL não está configurada no frontend.')
    }

    const token = await getToken()

    const response = await fetch(`${API_URL}${path}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        ...(options.headers || {}),
      },
    })

    const responseText = await response.text()

    let data = {}
    if (responseText) {
      try {
        data = JSON.parse(responseText)
      } catch {
        data = { message: responseText }
      }
    }

    if (!response.ok) {
      throw new Error(data.message || `Erro na API. Status: ${response.status}`)
    }

    return data
  }

  async function loadBooks() {
    try {
      const result = await api('/books')
      setBooks(result.books || [])
    } catch (error) {
      setMessage(`Erro ao carregar livros: ${error.message}`)
    }
  }

  useEffect(() => {
    loadBooks()
  }, [])

  async function handleScan() {
    let currentStep = 'Início'

    try {
      setMessage('')
      setLoading(true)

      if (!API_URL) {
        setMessage('Erro: VITE_API_URL não está configurada no frontend.')
        return
      }

      if (!file) {
        alert('Escolha ou tire uma foto da capa primeiro.')
        return
      }

      const contentType = file.type || 'image/jpeg'

      if (!['image/jpeg', 'image/png'].includes(contentType)) {
        setMessage(`Formato não suportado: ${contentType}. Use foto em JPEG ou PNG.`)
        return
      }

      currentStep = 'Etapa 1 - Gerar URL de upload na API'
      setMessage(`${currentStep}. Tipo da imagem: ${contentType}`)

      const uploadData = await api('/books/upload-url', {
        method: 'POST',
        body: JSON.stringify({ contentType }),
      })

      if (!uploadData.uploadUrl || !uploadData.imageKey) {
        throw new Error('A API não retornou uploadUrl ou imageKey.')
      }

      currentStep = 'Etapa 2 - Enviar foto para o S3'
      setMessage(`${currentStep}...`)

      const uploadResponse = await fetch(uploadData.uploadUrl, {
        method: 'PUT',
        headers: {
          'Content-Type': contentType,
        },
        body: file,
      })

      if (!uploadResponse.ok) {
        throw new Error(`Falha no upload para S3. Status: ${uploadResponse.status}`)
      }

      currentStep = 'Etapa 3 - Chamar Rekognition para ler a capa'
      setMessage(`${currentStep}...`)

      const scanData = await api('/books/scan', {
        method: 'POST',
        body: JSON.stringify({ imageKey: uploadData.imageKey }),
      })

      currentStep = 'Etapa 4 - Leitura concluída'
      setMessage('Etapa 4/4: leitura concluída. Confira os dados antes de salvar.')

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
    } catch (error) {
      console.error('Erro detalhado no handleScan:', error)
      setMessage(`Erro na ${currentStep}: ${error.message}`)
    } finally {
      setLoading(false)
    }
  }

  async function saveBook() {
    try {
      setMessage('')
      setLoading(true)

      if (!form.title.trim()) {
        alert('Informe o título do livro.')
        return
      }

      await api('/books', {
        method: 'POST',
        body: JSON.stringify(form),
      })

      setMessage('Livro cadastrado com sucesso!')
      clearForm()
      await loadBooks()
    } catch (error) {
      setMessage(`Erro ao salvar livro: ${error.message}`)
    } finally {
      setLoading(false)
    }
  }

  async function searchBook() {
    try {
      setMessage('')

      if (!search.trim()) {
        alert('Digite parte do título para pesquisar.')
        return
      }

      const result = await api(`/books/search?q=${encodeURIComponent(search)}`)
      setMatches(result.matches || [])
    } catch (error) {
      setMessage(`Erro ao pesquisar: ${error.message}`)
    }
  }

  async function deleteBook(bookId) {
    try {
      const confirmDelete = confirm('Deseja remover este livro?')

      if (!confirmDelete) {
        return
      }

      await api(`/books/${bookId}`, {
        method: 'DELETE',
      })

      setMessage('Livro removido com sucesso.')
      await loadBooks()
    } catch (error) {
      setMessage(`Erro ao remover livro: ${error.message}`)
    }
  }

  function clearForm() {
    setFile(null)
    setScanResult(null)
    setMessage('')
    setMatches([])
    setForm({
      bookId: '',
      title: '',
      publisher: '',
      edition: '',
      category: '',
      coverImageKey: '',
      status: 'Tenho',
    })
  }

  return (
    <div style={styles.page}>
      <header style={styles.header}>
        <div>
          <h1 style={styles.title}>Minha Biblioteca</h1>
          <p style={styles.subtitle}>Cadastre seus livros por foto e evite comprar repetido.</p>
        </div>

        <button style={styles.secondaryButton} onClick={() => signOut()}>
          Sair
        </button>
      </header>

      {message && <div style={styles.message}>{message}</div>}

      <section style={styles.card}>
        <h2 style={styles.sectionTitle}>Cadastrar livro por foto</h2>
        <p style={styles.helpText}>
          Tire uma foto da capa do livro. O sistema vai tentar ler o texto da imagem e sugerir os dados principais.
        </p>

        <input
          type="file"
          accept="image/jpeg,image/png"
          capture="environment"
          onChange={(event) => setFile(event.target.files?.[0] || null)}
          style={styles.fileInput}
        />

        {file && (
          <p style={styles.selectedFile}>
            Foto selecionada: {file.name} | Tipo: {file.type || 'sem tipo'}
          </p>
        )}

        <div style={styles.buttonRow}>
          <button style={styles.primaryButton} onClick={handleScan} disabled={loading}>
            {loading ? 'Processando...' : 'Ler capa do livro'}
          </button>

          <button style={styles.secondaryButton} onClick={clearForm} disabled={loading}>
            Limpar
          </button>
        </div>

        {scanResult && (
          <div style={styles.resultBox}>
            <h3>Texto detectado na capa</h3>
            {(scanResult.detectedText || []).length === 0 ? (
              <p>Nenhum texto foi detectado. Você pode preencher manualmente.</p>
            ) : (
              <ul>
                {(scanResult.detectedText || []).map((line, index) => (
                  <li key={index}>{line}</li>
                ))}
              </ul>
            )}

            <h3>Confirme ou corrija os dados</h3>

            <label style={styles.label}>Título *</label>
            <input
              style={styles.input}
              value={form.title}
              onChange={(event) => setForm({ ...form, title: event.target.value })}
              placeholder="Ex: 50 Discursos que Marcaram o Mundo Moderno"
            />

            <label style={styles.label}>Editora</label>
            <input
              style={styles.input}
              value={form.publisher}
              onChange={(event) => setForm({ ...form, publisher: event.target.value })}
              placeholder="Ex: L&PM"
            />

            <label style={styles.label}>Edição</label>
            <input
              style={styles.input}
              value={form.edition}
              onChange={(event) => setForm({ ...form, edition: event.target.value })}
              placeholder="Ex: 7ª edição"
            />

            <label style={styles.label}>Categoria</label>
            <input
              style={styles.input}
              value={form.category}
              onChange={(event) => setForm({ ...form, category: event.target.value })}
              placeholder="Ex: História / Política / Discursos"
            />

            <label style={styles.label}>Status</label>
            <select
              style={styles.input}
              value={form.status}
              onChange={(event) => setForm({ ...form, status: event.target.value })}
            >
              <option value="Tenho">Tenho</option>
              <option value="Quero comprar">Quero comprar</option>
              <option value="Emprestado">Emprestado</option>
              <option value="Lido">Lido</option>
              <option value="Não lido">Não lido</option>
            </select>

            <button style={styles.primaryButton} onClick={saveBook} disabled={loading}>
              {loading ? 'Salvando...' : 'Salvar livro'}
            </button>
          </div>
        )}
      </section>

      <section style={styles.card}>
        <h2 style={styles.sectionTitle}>Pesquisar antes de comprar</h2>
        <p style={styles.helpText}>Digite parte do título para verificar se você já tem esse livro cadastrado.</p>

        <div style={styles.searchRow}>
          <input
            style={styles.searchInput}
            placeholder="Ex: 50 discursos"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') searchBook()
            }}
          />

          <button style={styles.primaryButton} onClick={searchBook}>
            Pesquisar
          </button>
        </div>

        {matches.length > 0 && (
          <div style={styles.resultBox}>
            <h3>Você já pode ter esse livro:</h3>
            <ul>
              {matches.map((book) => (
                <li key={book.bookId}>
                  <strong>{book.title}</strong>
                  {book.publisher ? ` — ${book.publisher}` : ''}
                  {book.category ? ` — ${book.category}` : ''}
                </li>
              ))}
            </ul>
          </div>
        )}

        {matches.length === 0 && search && (
          <p style={styles.helpText}>Nenhum resultado encontrado para essa busca.</p>
        )}
      </section>

      <section style={styles.card}>
        <h2 style={styles.sectionTitle}>Livros cadastrados</h2>

        {books.length === 0 ? (
          <p style={styles.helpText}>Nenhum livro cadastrado ainda.</p>
        ) : (
          <div style={styles.bookList}>
            {books.map((book) => (
              <div key={book.bookId} style={styles.bookItem}>
                <div>
                  <strong>{book.title}</strong>
                  <p style={styles.bookMeta}>
                    Editora: {book.publisher || '-'} | Categoria: {book.category || '-'} | Status: {book.status || '-'}
                  </p>
                  {book.edition && <p style={styles.bookMeta}>Edição: {book.edition}</p>}
                </div>

                <button style={styles.dangerButton} onClick={() => deleteBook(book.bookId)}>
                  Remover
                </button>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}

const styles = {
  page: {
    maxWidth: 960,
    margin: '0 auto',
    padding: 24,
    fontFamily: 'Arial, sans-serif',
    color: '#1f2937',
    background: '#f8fafc',
    minHeight: '100vh',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    gap: 16,
    alignItems: 'center',
    marginBottom: 24,
  },
  title: { margin: 0, fontSize: 36 },
  subtitle: { marginTop: 8, color: '#64748b' },
  card: {
    background: '#ffffff',
    border: '1px solid #e5e7eb',
    borderRadius: 12,
    padding: 24,
    marginBottom: 24,
    boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
  },
  sectionTitle: { marginTop: 0 },
  helpText: { color: '#64748b', lineHeight: 1.5 },
  message: {
    background: '#ecfeff',
    border: '1px solid #67e8f9',
    color: '#155e75',
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
    whiteSpace: 'pre-wrap',
  },
  fileInput: { display: 'block', marginTop: 16, marginBottom: 8 },
  selectedFile: { color: '#475569', fontSize: 14 },
  buttonRow: { display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 16 },
  primaryButton: {
    background: '#2563eb',
    color: '#ffffff',
    border: 'none',
    borderRadius: 8,
    padding: '10px 16px',
    cursor: 'pointer',
    fontWeight: 'bold',
  },
  secondaryButton: {
    background: '#e5e7eb',
    color: '#111827',
    border: 'none',
    borderRadius: 8,
    padding: '10px 16px',
    cursor: 'pointer',
    fontWeight: 'bold',
  },
  dangerButton: {
    background: '#fee2e2',
    color: '#991b1b',
    border: '1px solid #fecaca',
    borderRadius: 8,
    padding: '8px 12px',
    cursor: 'pointer',
    fontWeight: 'bold',
  },
  resultBox: {
    background: '#f8fafc',
    border: '1px solid #e2e8f0',
    borderRadius: 8,
    padding: 16,
    marginTop: 20,
  },
  label: { display: 'block', marginTop: 12, marginBottom: 6, fontWeight: 'bold' },
  input: {
    display: 'block',
    width: '100%',
    padding: 10,
    borderRadius: 8,
    border: '1px solid #cbd5e1',
    marginBottom: 8,
    boxSizing: 'border-box',
  },
  searchRow: { display: 'flex', gap: 12, flexWrap: 'wrap' },
  searchInput: {
    flex: 1,
    minWidth: 240,
    padding: 10,
    borderRadius: 8,
    border: '1px solid #cbd5e1',
  },
  bookList: { display: 'flex', flexDirection: 'column', gap: 12 },
  bookItem: {
    border: '1px solid #e5e7eb',
    borderRadius: 8,
    padding: 16,
    display: 'flex',
    justifyContent: 'space-between',
    gap: 16,
    alignItems: 'center',
  },
  bookMeta: { margin: '6px 0 0', color: '#64748b', fontSize: 14 },
}

export default App
