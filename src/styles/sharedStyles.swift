// src/styles/sharedStyles.js
// 全ページ共通で使えるレスポンシブ対応スタイル

const styles = {
  page: {
    background: 'linear-gradient(to bottom, #fff7ed, #e0f2fe)',
    minHeight: '100vh',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '20px',
  },
  card: {
    background: 'white',
    borderRadius: '16px',
    boxShadow: '0 6px 20px rgba(0,0,0,0.1)',
    padding: '24px',
    width: '90%',
    maxWidth: '480px',
    textAlign: 'center',
  },
  title: {
    fontSize: '1.6rem',
    color: '#0ea5e9',
    marginBottom: '16px',
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
    width: '100%',
  },
  input: {
    width: '100%',
    padding: '10px',
    borderRadius: '8px',
    border: '1px solid #ccc',
    fontSize: '1rem',
  },
  button: {
    background: '#38bdf8',
    color: 'white',
    padding: '12px',
    borderRadius: '8px',
    border: 'none',
    fontWeight: 'bold',
    fontSize: '1rem',
    cursor: 'pointer',
    width: '100%',
  },
  buttons: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
    width: '100%',
    maxWidth: '400px',
    margin: '0 auto',
    marginTop: '20px',
  },
  tableWrapper: {
    overflowX: 'auto',
    width: '100%',
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
    fontSize: '0.9rem',
  },
  tableCell: {
    border: '1px solid #ccc',
    padding: '8px',
  },
}

export default styles
