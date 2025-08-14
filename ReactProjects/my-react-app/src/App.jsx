import { useState, useRef, useEffect, useCallback } from 'react';
import './App.css';

function App() {
  // State for the current input message
  const [message, setMessage] = useState('');
  // State for the chat history (array of {sender, text})
  const [chatHistory, setChatHistory] = useState([]);
  // State to indicate if a message is being sent/response is loading
  const [isLoading, setIsLoading] = useState(false);
  // State to control the animated typing indicator
  const [isTyping, setIsTyping] = useState(false);
  // State for the animated dots in the typing indicator
  const [dotCount, setDotCount] = useState(1);
  // Speech recognition states
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [speechError, setSpeechError] = useState('');
  // Wake word states
  const [isWakeWordListening, setIsWakeWordListening] = useState(false);
  const [wakeWordDetected, setWakeWordDetected] = useState(false);
  const [wakeWordTranscript, setWakeWordTranscript] = useState('');
  const [memory, setMemory] = useState('');
  const [answer, setAnswer] = useState('');

  const chatWindowRef = useRef(null);
  const recognitionRef = useRef(null);
  const wakeWordRecognitionRef = useRef(null);
  // Recent short-term memory stacks (refs to avoid unnecessary re-renders)
  const recentUsersRef = useRef([]);
  const recentAssistantsRef = useRef([]);

  // Initialize wake word detection using Web Speech API
  useEffect(() => {
    if (isWakeWordListening && !wakeWordRecognitionRef.current) {
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      
      if (SpeechRecognition) {
        wakeWordRecognitionRef.current = new SpeechRecognition();
        wakeWordRecognitionRef.current.continuous = true;
        wakeWordRecognitionRef.current.interimResults = true;
        wakeWordRecognitionRef.current.lang = 'en-US';
        
        wakeWordRecognitionRef.current.onresult = (event) => {
          let finalTranscript = '';
          let interimTranscript = '';
          
          for (let i = event.resultIndex; i < event.results.length; i++) {
            const transcript = event.results[i][0].transcript;
            if (event.results[i].isFinal) {
              finalTranscript += transcript + ' ';
            } else {
              interimTranscript += transcript;
            }
          }
          
          const fullTranscript = finalTranscript + interimTranscript;
          setWakeWordTranscript(fullTranscript);
          
          // Check if "wake up" is detected (only if not already detected)
          if (fullTranscript.toLowerCase().includes('wake up') && !wakeWordDetected) {
            setWakeWordDetected(true);
            // Stop wake word listening and start normal speech recognition
            setIsWakeWordListening(false);
            setWakeWordDetected(false);
            setWakeWordTranscript('');
            // Wait a moment for cleanup, then start normal speech recognition
            setTimeout(() => {
              // Make sure normal speech recognition is not already running
              if (recognitionRef.current && recognitionRef.current.state === 'inactive') {
                handleMicrophoneClick();
              } else {
                // Wait a bit longer and try again
                setTimeout(() => {
                  handleMicrophoneClick();
                }, 500);
              }
            }, 200);
          }
        };
        
        wakeWordRecognitionRef.current.onstart = () => {};
        
        wakeWordRecognitionRef.current.onerror = (event) => {
          console.error('Wake word recognition error:', event.error);
          setSpeechError(`Wake word error: ${event.error}`);
        };
        
        wakeWordRecognitionRef.current.onend = () => {
          if (isWakeWordListening && wakeWordRecognitionRef.current) {
            // Restart if still supposed to be listening and ref exists
            try {
              wakeWordRecognitionRef.current.start();
            } catch (error) {
              console.error('Failed to restart wake word detection:', error);
            }
          }
        };
        
        // Start wake word detection
        try {
          wakeWordRecognitionRef.current.start();
        } catch (error) {
          console.error('Failed to start wake word detection:', error);
          setSpeechError(`Failed to start wake word detection: ${error.message}`);
        }
      } else {
        setSpeechError('Speech recognition not supported in this browser');
      }
    }
    
    // Cleanup when stopping wake word detection
    if (!isWakeWordListening && wakeWordRecognitionRef.current) {
      try {
        wakeWordRecognitionRef.current.stop();
      } catch (error) {
        console.error('Error stopping wake word detection:', error);
      }
      wakeWordRecognitionRef.current = null;
      setWakeWordTranscript('');
      setWakeWordDetected(false);
    }
  }, [isWakeWordListening]);

  // Initialize speech recognition
  useEffect(() => {
    // Try different speech recognition APIs
    let SpeechRecognition = null;
    
    if ('SpeechRecognition' in window) {
      SpeechRecognition = window.SpeechRecognition;
    } else if ('webkitSpeechRecognition' in window) {
      SpeechRecognition = window.webkitSpeechRecognition;
    }
    
    if (SpeechRecognition) {
      recognitionRef.current = new SpeechRecognition();
      
      // Configure for better compatibility
      recognitionRef.current.continuous = false;
      recognitionRef.current.interimResults = true;
      recognitionRef.current.lang = 'en-US';
      recognitionRef.current.maxAlternatives = 1;
      
      // Set timeout to prevent hanging
      recognitionRef.current.timeout = 25000;

      recognitionRef.current.onstart = () => {
        setIsListening(true);
        setTranscript('');
        setSpeechError('');
      };

      recognitionRef.current.onresult = (event) => {
        let finalTranscript = '';
        let interimTranscript = '';

        for (let i = event.resultIndex; i < event.results.length; i++) {
          const transcript = event.results[i][0].transcript;
          if (event.results[i].isFinal) {
            finalTranscript += transcript + ' ';
          } else {
            interimTranscript += transcript;
          }
        }

        const fullTranscript = finalTranscript + interimTranscript;
        setTranscript(fullTranscript);
        
        // Only set the message when we have final results
        if (finalTranscript.trim()) {
          setMessage(finalTranscript.trim());
        }
      };

      recognitionRef.current.onerror = (event) => {
        console.error('Speech recognition error:', event.error);
        setIsListening(false);
        
        // Handle specific errors
        switch (event.error) {
          case 'network':
            setSpeechError('Network error - check internet connection and try again');
            break;
          case 'not-allowed':
            setSpeechError('Microphone access denied - please allow microphone access');
            break;
          case 'no-speech':
            setSpeechError('No speech detected - try speaking louder');
            break;
          case 'audio-capture':
            setSpeechError('No microphone found - check your microphone');
            break;
          case 'aborted':
            setSpeechError('Speech recognition was aborted');
            break;
          default:
            setSpeechError(`Speech error: ${event.error}`);
        }
      };

      recognitionRef.current.onend = () => {
        setIsListening(false);
        
        // If we have a final transcript, keep it in the message field
        if (transcript.trim() && !message.trim()) {
          setMessage(transcript.trim());
        }
      };
    } else {
      setSpeechError('Speech recognition not supported in this browser');
    }
  }, []);

  useEffect(() => {
    if (isTyping) {
      const interval = setInterval(() => {
        setDotCount((prev) => (prev % 3) + 1);
      }, 400);
      return () => clearInterval(interval);
    } else {
      setDotCount(1);
    }
  }, [isTyping]);

  // Effect: Auto-scroll to the bottom of the chat window when chat updates
  useEffect(() => {
    if (chatWindowRef.current) {
      chatWindowRef.current.scrollTop = chatWindowRef.current.scrollHeight;
    }
  }, [chatHistory, isTyping]);

  const handleInputChange = (e) => {
    setMessage(e.target.value);
  };

  // Roll-up: integrate an older pair into long-term memory
  const updateMemoryAfterAnswer = async (userMessageText, answerText) => {
    if (!answerText || !answerText.trim()) return;
    try {
      const summaryPrompt = `Update the long-term memory below by integrating only durable facts, user preferences, decisions, and commitments from the following user message and assistant answer. Do not include ephemeral chit-chat. Keep it concise but specific. Output the UPDATED MEMORY only, plain text.

Previous memory:
${memory || ''}

User message:
${userMessageText}

Assistant answer:
${answerText}`;

      const response = await fetch('http://localhost:3000/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({ 
          message: summaryPrompt
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to update memory');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let newSummary = '';
      
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n');
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6));
              if (data.content) {
                newSummary += data.content;
              }
            } catch {}
          }
        }
      }

      setMemory(newSummary.trim());
    } catch (error) {
      console.error('Error updating memory:', error);
    }
  };

  // Handle wake word toggle
  const handleWakeWordToggle = () => {
    if (!isWakeWordListening) {
      // Start wake word detection
      setIsWakeWordListening(true);
      setSpeechError(''); // Clear any previous errors
    } else {
      // Stop wake word detection
      setIsWakeWordListening(false);
      setSpeechError(''); // Clear any previous errors
    }
  };

  // Handle microphone button click
  const handleMicrophoneClick = useCallback(() => {
    if (!recognitionRef.current) {
      setSpeechError('Speech recognition not supported in this browser');
      return;
    }

    if (isListening) {
      recognitionRef.current.stop();
    } else {
      try {
        // Make sure it's not already running
        if (recognitionRef.current.state === 'inactive') {
          recognitionRef.current.start();
        } else {
          recognitionRef.current.stop();
          // Wait a moment then start
          setTimeout(() => {
            try {
              recognitionRef.current.start();
            } catch (error) {
              console.error('Error starting speech recognition after stop:', error);
              setSpeechError('Failed to start speech recognition after stop');
            }
          }, 100);
        }
      } catch (error) {
        console.error('Error starting speech recognition:', error);
        setSpeechError('Failed to start speech recognition');
      }
    }
  }, [isListening]);

  // Handle sending a message (user presses send or Enter)
  const handleSendMessage = async () => {
    if (!message.trim() || isLoading) return; // Prevent sending empty or duplicate messages

    const userMessageText = message;
    // Add user's message to chat
    const newUserMessage = { sender: 'user', text: userMessageText };
    setChatHistory((prevHistory) => [...prevHistory, newUserMessage]);

    setMessage(''); // Clear input field
    setTranscript(''); // Clear transcript
    setIsLoading(true); // Set loading state
    setIsTyping(true); // Show typing indicator

    // Add a placeholder for the bot's streaming response (will be filled in as text streams in)
    setChatHistory((prevHistory) => [...prevHistory, { sender: 'bot', text: '' }]);

    try {
      // Build prompt using memory and up to last 3 completed pairs (most recent last)
      let messageToSend = userMessageText;
      const pairCount = Math.min(recentUsersRef.current.length, recentAssistantsRef.current.length);
      const startIdx = Math.max(0, pairCount - 3);
      const recentPairs = [];
      for (let i = startIdx; i < pairCount; i++) {
        recentPairs.push(`User: ${recentUsersRef.current[i]}\nAssistant: ${recentAssistantsRef.current[i]}`);
      }
      const recentBlock = recentPairs.length > 0 ? `\n\nRecent conversation (most recent last):\n${recentPairs.join('\n\n')}` : '';
      if ((memory && memory.trim().length > 0) || recentPairs.length > 0) {
        messageToSend = `Instruction: Use the provided context only to inform your answer. Do not quote or restate the context. Do not include role labels or step markers. Respond directly and concisely to the next message.${recentBlock}\n\nContext (optional):\n${memory || ''}\n\nNext message:\n${userMessageText}`.trim();
      }

      // After building context, push the current user message into the short-term stack
      recentUsersRef.current.push(userMessageText);

      // Send the message to the backend /chat endpoint (ONLY when Send button is pressed)
      const response = await fetch('http://localhost:3000/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({ 
          message: messageToSend
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'A apărut o eroare la backend');
      }

      // Streaming logic: read the response as a stream and reveal it character by character
      const reader = response.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let done = false;
      let responseEnded = false;
      let accumulated = '';
      let botIndex = null;
      let firstChunk = true;
      let charQueue = [];
      let revealTimeout = null;

      // Find the index of the placeholder bot message
      setChatHistory((prevHistory) => {
        botIndex = prevHistory.length - 1;
        return prevHistory;
      });

      // Helper: reveal characters from the queue one by one for smooth animation
      const revealNextChar = () => {
        const REVEAL_CHUNK_SIZE = 16;
        if (charQueue.length > 0) {
          const chunk = charQueue.splice(0, REVEAL_CHUNK_SIZE).join('');
          accumulated += chunk;
          setChatHistory((prevHistory) => {
            const updated = [...prevHistory];
            updated[botIndex] = { sender: 'bot', text: accumulated };
            return updated;
          });
          revealTimeout = setTimeout(revealNextChar, 0);
        } else {
          revealTimeout = null;
        }
      };

      // Read the response stream chunk by chunk
      while (!done) {
        const { value, done: streamDone } = await reader.read();
        done = streamDone;
        if (value) {
          const chunk = decoder.decode(value, { stream: true });
          // Parse Server-Sent Events (SSE) lines
          const lines = chunk.split('\n');
          for (const line of lines) {
            if (line.startsWith('data: ')) {
              try {
                const data = JSON.parse(line.slice(6));
                if (data.content) {
                  if (firstChunk) {
                    setIsTyping(false); // Hide typing indicator on first chunk
                    firstChunk = false;
                  }
                  // Add new characters to the queue
                  charQueue.push(...data.content);
                  // Start revealing if not already
                  if (!revealTimeout) {
                    revealNextChar();
                  }
                }
              } catch (e) { /* ignore parse errors */ }
            }
            if (line.startsWith('event: end')) {
              done = true;
              responseEnded = true;
            }
            if (line.startsWith('event: error')) {
              done = true;
              setChatHistory((prevHistory) => {
                const updated = [...prevHistory];
                updated[botIndex] = { sender: 'bot', text: 'Eroare la backend.' };
                return updated;
              });
              setIsTyping(false);
            }
          }
        }
      }
      // Wait for all characters to be revealed before hiding typing
      while (charQueue.length > 0) {
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
      setIsTyping(false); // Ensure typing indicator is hidden at the end
      // After stream fully ended and all queued chars revealed, update short-term stacks and long-term memory
      if (responseEnded && accumulated.trim().length > 0) {
        setAnswer(accumulated);
        // Push assistant answer into short-term stack
        recentAssistantsRef.current.push(accumulated);
        // If both stacks exceed 3, roll up oldest pairs into long-term memory
        while (recentUsersRef.current.length > 3 && recentAssistantsRef.current.length > 3) {
          const poppedUser = recentUsersRef.current.shift();
          const poppedAssistant = recentAssistantsRef.current.shift();
          await updateMemoryAfterAnswer(poppedUser, poppedAssistant);
        }
      }
    } catch (error) {
      // Handle errors and show error message in chat
      console.error('Eroare la trimiterea mesajului:', error);
      setChatHistory((prevHistory) => {
        const updated = [...prevHistory];
        updated[updated.length - 1] = { sender: 'bot', text: `Eroare: ${error.message}. Verifică serverul backend și conexiunea!` };
        return updated;
      });
      setIsTyping(false);
    } finally {
      setIsLoading(false);
    }
  };

  // Render the chat UI
  return (
    <div className="App" style={{
      height: '100vh',
      width: '100vw',
      margin: 0,
      padding: 0,
      boxSizing: 'border-box',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: '#222',
    }}>
      {/* Title at the top */}
      <h1 style={{
        margin: 0,
        padding: '20px 0 10px 0',
        textAlign: 'center',
        backgroundColor: '#222',
        color: '#fff',
        fontSize: '2rem',
        flex: '0 0 auto',
      }}>Jarvis 0.1</h1>
      
      {/* Speech mode indicator */}
              {speechError && (
          <div style={{
            padding: '5px 15px',
            backgroundColor: '#dc3545',
            color: 'white',
            borderRadius: '4px',
            marginBottom: '10px',
            fontSize: '0.9rem',
          }}>
            {speechError}
          </div>
        )}
        
        {/* Removed Porcupine error message */}
        
                 {!isWakeWordListening && (
           <div style={{
             padding: '5px 15px',
             backgroundColor: '#17a2b8',
             color: 'white',
             borderRadius: '4px',
             marginBottom: '10px',
             fontSize: '0.9rem',
           }}>
             Wake word detection is off. Click the 🔔 button to start.
           </div>
         )}
         
         {isWakeWordListening && (
           <div style={{
             padding: '5px 15px',
             backgroundColor: '#28a745',
             color: 'white',
             borderRadius: '4px',
             marginBottom: '10px',
             fontSize: '0.9rem',
           }}>
             🔔 Listening for "wake up"... {wakeWordTranscript && `(Heard: "${wakeWordTranscript}")`}
           </div>
         )}
         
         {wakeWordDetected && (
           <div style={{
             padding: '5px 15px',
             backgroundColor: '#ffc107',
             color: '#212529',
             borderRadius: '4px',
             marginBottom: '10px',
             fontSize: '0.9rem',
           }}>
             🎯 Wake word detected! Starting speech recognition...
           </div>
         )}
         

      
      {/* Main chat box */}
      <div style={{
        width: '800px',
        height: '500px',
        backgroundColor: '#222',
        borderRadius: '12px',
        boxShadow: '0 4px 24px rgba(0,0,0,0.4)',
        display: 'flex',
        flexDirection: 'column',
        marginTop: '10px',
      }}>
        {/* Chat window: shows all messages */}
        <div className="chat-window" ref={chatWindowRef} style={{
          border: '1px solid #333',
          padding: '10px',
          flex: '1 1 auto',
          minHeight: 0,
          maxHeight: '100%',
          overflowY: 'scroll',
          overflowX: 'hidden',
          boxSizing: 'border-box',
          backgroundColor: '#333',
          color: '#eee',
          borderRadius: '8px',
          margin: '0 10px 10px 10px',
        }}>
          {/* Render each message bubble, skipping empty bot placeholder */}
          {chatHistory.map((msg, index) => {
            // Hide empty bot bubble if it's the last message and has no text
            if (
              index === chatHistory.length - 1 &&
              msg.sender === 'bot' &&
              (!msg.text || msg.text.length === 0)
            ) {
              return null;
            }
            return (
              <div key={index} className={`message ${msg.sender}`} style={{
                textAlign: msg.sender === 'user' ? 'right' : 'left',
                margin: '5px 0'
              }}>
                <span style={{
                  backgroundColor: msg.sender === 'user' ? '#007bff' : '#6c757d',
                  padding: '8px 12px',
                  borderRadius: '15px',
                  display: 'inline-block',
                  maxWidth: '80%',
                  whiteSpace: 'pre-line', // Preserve newlines in message text
                }}>{msg.text}</span>
              </div>
            );
          })}
          {/* Animated typing indicator with three jumping dots */}
          {isTyping && (
            <div style={{ textAlign: 'left', margin: '5px 0' }}>
              <span style={{ backgroundColor: '#6c757d', padding: '8px 12px', borderRadius: '15px', display: 'inline-block', minWidth: '40px', letterSpacing: '2px' }}>
                <span style={{
                  display: 'inline-block',
                  animation: 'jump 1.2s infinite',
                  animationDelay: '0s',
                  transform: dotCount === 1 ? 'translateY(-4px)' : 'none',
                }}>.</span>
                <span style={{
                  display: 'inline-block',
                  animation: 'jump 1.2s infinite',
                  animationDelay: '0.2s',
                  transform: dotCount === 2 ? 'translateY(-4px)' : 'none',
                }}>.</span>
                <span style={{
                  display: 'inline-block',
                  animation: 'jump 1.2s infinite',
                  animationDelay: '0.4s',
                  transform: dotCount === 3 ? 'translateY(-4px)' : 'none',
                }}>.</span>
              </span>
            </div>
          )}
        </div>
        {/* Input area at the bottom */}
        <div className="chat-input" style={{
          display: 'flex',
          flex: '0 0 auto',
          padding: '10px 10px 20px 10px',
          backgroundColor: '#222',
          alignItems: 'center',
        }}>
          {/* Voice transcript display */}
          {transcript && transcript !== message && (
            <div style={{
              flexGrow: 1,
              padding: '8px 12px',
              backgroundColor: '#444',
              color: '#fff',
              borderRadius: '4px',
              marginRight: '10px',
              fontSize: '0.9rem',
              fontStyle: 'italic',
              border: '1px solid #666',
            }}>
              "{transcript}"
            </div>
          )}
          
          <input
            type="text"
            value={message}
            onChange={handleInputChange}
            onKeyPress={(e) => {
              if (e.key === 'Enter') {
                handleSendMessage();
              }
            }}
            placeholder={isListening ? "Listening..." : "Scrie un mesaj..."}
            disabled={isLoading}
            style={{
              flexGrow: 1,
              padding: '10px',
              border: '1px solid #ccc',
              borderRadius: '4px',
              marginRight: '5px',
              backgroundColor: '#444',
              color: '#eee',
              fontSize: '1rem',
            }}
          />
          <button
            onClick={handleSendMessage}
            disabled={isLoading}
            style={{
              padding: '10px 15px',
              backgroundColor: '#28a745',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              opacity: isLoading ? 0.6 : 1,
              fontSize: '1rem',
              marginRight: '5px',
            }}
          >
            Send
          </button>
          
          {/* Wake word toggle button */}
          <button
            onClick={handleWakeWordToggle}
            style={{
              padding: '10px',
              backgroundColor: isWakeWordListening ? '#28a745' : '#6c757d',
              color: 'white',
              border: 'none',
              borderRadius: '50%',
              cursor: 'pointer',
              width: '40px',
              height: '40px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '16px',
              marginRight: '5px',
              transition: 'all 0.3s ease',
            }}
            title={isWakeWordListening ? 'Wake word listening - Click to stop' : 'Start wake word detection'}

          >
            🔔
          </button>

          {/* Microphone button */}
          <button
            onClick={handleMicrophoneClick}
            disabled={isLoading}
            style={{
              padding: '10px',
              backgroundColor: isListening ? '#dc3545' : '#6c757d',
              color: 'white',
              border: 'none',
              borderRadius: '50%',
              cursor: 'pointer',
              width: '40px',
              height: '40px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '16px',
              transition: 'all 0.3s ease',
            }}
            title={isListening ? 'Stop recording' : 'Start voice input'}
          >
            🎤
          </button>
        </div>
      </div>
    </div>
  );
}

export default App;

// Add keyframes for jump animation (for the animated dots)
const style = document.createElement('style');
style.innerHTML = `@keyframes jump { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-4px); } }`;
if (!document.head.querySelector('style[data-jump]')) {
  style.setAttribute('data-jump', 'true');
  document.head.appendChild(style);
}