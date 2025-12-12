import { BrowserRouter, Routes, Route } from 'react-router-dom';
import TtsEditor from './pages/TtsEditor';
import Home from './pages/Home';
import './App.css';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/tts-editor" element={<TtsEditor />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
