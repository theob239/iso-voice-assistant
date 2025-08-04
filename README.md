# VSP Chat Jarvis - Early Prototype

A conversational AI chat application with streaming responses, built with React and Node.js. This is an early prototype version that demonstrates real-time chat functionality with Ollama integration.

## 🚀 Features

- **Real-time Chat Interface**: Stream responses character-by-character for a natural typing effect
- **Animated Typing Indicator**: Visual feedback with jumping dots while AI is responding
- **Dark Theme UI**: Modern, clean interface with dark color scheme
- **Auto-scrolling Chat**: Automatically scrolls to show latest messages
- **Streaming Responses**: Uses Server-Sent Events (SSE) for real-time communication
- **Ollama Integration**: Connects to local Ollama server for AI responses

## 📁 Project Structure

```
VSP/
├── ReactProjects/my-react-app/     # React frontend (Vite)
│   ├── src/
│   │   ├── App.jsx                 # Main chat interface
│   │   ├── App.css                 # Styling
│   │   └── index.css               # Global styles
│   └── package.json
├── my-node-app/                    # Express backend
│   ├── app.js                      # Server with Ollama integration
│   └── package.json
├── PRD-Jarvis                      # Product Requirements Document
└── parts.md                        # Future feature ideas
```

## 🛠️ Setup Instructions

### Prerequisites
- Node.js (v18 or higher)
- Ollama installed and running locally
- Llama3.1 model downloaded in Ollama

### Backend Setup
```bash
cd my-node-app
npm install
npm start
```

The backend will run on `http://localhost:3000`

### Frontend Setup
```bash
cd ReactProjects/my-react-app
npm install
npm run dev
```

The frontend will run on `http://localhost:5173`

## 🎯 Current Status

### ✅ Implemented
- Basic chat interface with streaming responses
- Real-time character-by-character display
- Animated typing indicators
- Auto-scrolling chat window
- Dark theme UI
- Ollama integration with SSE

### 🚧 Planned Features (Not Yet Implemented)
- User authentication system
- Landing page and navigation
- RAG (Retrieval-Augmented Generation) functionality
- Database integration for chat history
- User management
- Voice wake word detection
- Speech-to-text and text-to-speech
- Vectorized memory database

## 🔧 Technical Details

- **Frontend**: React 19 + Vite
- **Backend**: Express.js + Ollama
- **Communication**: Server-Sent Events (SSE) for streaming
- **Styling**: CSS with dark theme
- **AI Model**: Llama3.1 via Ollama

## 📝 Usage

1. Start both backend and frontend servers
2. Open the frontend in your browser
3. Type messages in the chat input
4. Watch as the AI responds with streaming text

## 🤝 Contributing

This is an early prototype. Future development will include:
- Breaking down the monolithic App.jsx into components
- Implementing authentication
- Adding RAG capabilities
- Database integration
- Voice features

## 📄 License

ISC License

---

**Note**: This is version 0.1 - an early prototype demonstrating core chat functionality. The full feature set is planned according to the PRD document. 