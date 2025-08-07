import express from 'express';
import ollama from 'ollama';
import { Porcupine } from '@picovoice/porcupine-node';

const app = express();
const port = 3000;



// Configure Ollama client to connect to company server
// Environment variables are loaded from .env file or system environment
// OLLAMA_HOST and OLLAMA_API_KEY should be set in .env file

// Middleware pentru a permite accesul de la alte domenii (CORS)
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, DELETE'); // Permitem și POST
  next();
});

// Middleware pentru a parsa corpul cererilor JSON
app.use(express.json());

// Endpoint-ul existent pentru verificare stare
app.get('/health', (req, res) => {
  res.status(200).send('Backend is running!');
});

// Endpoint pentru chat cu Ollama
app.post('/chat', async (req, res) => {
    const { message } = req.body; // Extragem mesajul din corpul cererii (JSON)

    if (!message) {
        return res.status(400).send('Mesajul este necesar în corpul cererii.');
    }

    try {
        // Set headers for Server-Sent Events (SSE)
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');

        // Folosim stream: true pentru a primi chunk-uri de la Ollama
        const stream = await ollama.chat({
            model: 'llama3.1',
            messages: [{ role: 'user', content: message }],
            stream: true
        });

        let fullMessage = '';
        for await (const chunk of stream) {
            if (chunk.message && chunk.message.content) {
                fullMessage += chunk.message.content;
                // Send each chunk as an SSE event
                res.write(`data: ${JSON.stringify({ content: chunk.message.content })}\n\n`);
            }
        }
        // Signal end of stream
        res.write('event: end\ndata: END\n\n');
        res.end();
    } catch (error) {
        console.error('Eroare la comunicarea cu Ollama:', error.message);
        // Send error as SSE event
        res.write(`event: error\ndata: ${JSON.stringify({ error: error.message })}\n\n`);
        res.end();
    }
});



// Wake word detection endpoint
app.post('/wake-word', async (req, res) => {
  try {
    const { audioData } = req.body;
    
    if (!audioData) {
      return res.status(400).json({ error: 'Audio data is required' });
    }

    // For now, return a simple response since we need to set up the model
    // In a real implementation, you would process the audio with Porcupine
    res.json({ 
      detected: false,
      message: 'Wake word detection will be implemented when model is downloaded'
    });
    
  } catch (error) {
    console.error('Wake word error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Pornim serverul Express
app.listen(port, () => {
  console.log(`Serverul Express a pornit pe http://localhost:${port}`);
  console.log('Endpoint-ul /health este disponibil.');
  console.log('Endpoint-ul /chat (POST) este disponibil.');
  console.log('Endpoint-ul /wake-word (POST) este disponibil.');
});