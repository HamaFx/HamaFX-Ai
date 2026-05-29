const http = require('http');

fetch("http://localhost:3000/api/market/candles?symbol=XAUUSD&tf=1h&count=30")
  .then(async r => {
    console.log("Candles Status:", r.status);
    console.log((await r.text()).slice(0, 500));
  })
  .catch(console.error);

const chatBody = {
  threadId: "123e4567-e89b-12d3-a456-426614174000",
  messages: [{ id: "m1", role: "user", parts: [{type: "text", text: "hello"}] }]
};
fetch("http://localhost:3000/api/chat", {
  method: "POST", headers: {"Content-Type": "application/json"},
  body: JSON.stringify(chatBody)
}).then(async r => {
  console.log("Chat Status:", r.status);
  console.log((await r.text()).slice(0, 500));
}).catch(console.error);
