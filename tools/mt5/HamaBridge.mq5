//+------------------------------------------------------------------+
//|                                                   HamaBridge.mq5 |
//|                                  Copyright 2026, HamaFX-Ai Team  |
//|                                       https://hama-fx-ai.app     |
//+------------------------------------------------------------------+
#property copyright "Copyright 2026, HamaFX-Ai"
#property link      "https://hama-fx-ai.app"
#property version   "1.00"
#property strict

// --- Input Parameters ---------------------------------------------
input string Host = "127.0.0.1";
input int    Port = 8080;
input bool   StreamMarketWatch = true; // Stream ticks for all symbols in Market Watch

int socket_handle = INVALID_HANDLE;
datetime last_reconnect_time = 0;
int reconnect_delay_sec = 2;

//+------------------------------------------------------------------+
//| Expert initialization function                                   |
//+------------------------------------------------------------------+
int OnInit() {
   Print("[HamaBridge] Initializing bridge EA...");
   ResetLastError();
   
   // Enable WebRequests/Sockets for local host
   if(!TerminalInfoInteger(TERMINAL_COMMUNITY_CONNECTION)) {
      Print("[HamaBridge] Warning: Ensure local network sockets are whitelisted in Tools -> Options -> Expert Advisors");
   }
   
   if(!ConnectSocket()) {
      Print("[HamaBridge] First connection attempt failed. Reconnect timer started.");
   }
   
   return(INIT_SUCCEEDED);
}

//+------------------------------------------------------------------+
//| Expert deinitialization function                                 |
//+------------------------------------------------------------------+
void OnDeinit(const int reason) {
   Print("[HamaBridge] Deinitializing EA, closing socket.");
   DisconnectSocket();
}

//+------------------------------------------------------------------+
//| Expert tick function                                             |
//+------------------------------------------------------------------+
void OnTick() {
   // Stream price for the current active chart symbol
   if(!StreamMarketWatch) {
      StreamSymbolTick(Symbol());
   }
}

//+------------------------------------------------------------------+
//| Timer function for connection monitor and watch stream           |
//+------------------------------------------------------------------+
void OnTimer() {
   // If connection is dead, try reconnecting with a simple timer
   if(socket_handle == INVALID_HANDLE) {
      datetime now = TimeCurrent();
      if(now - last_reconnect_time >= reconnect_delay_sec) {
         Print("[HamaBridge] Connection dead, attempting reconnect...");
         ConnectSocket();
      }
      return;
   }
   
   // Stream ticks for all active symbols in Market Watch to bypass multi-chart attachment necessity
   if(StreamMarketWatch) {
      int total_symbols = SymbolsTotal(true);
      for(int i = 0; i < total_symbols; i++) {
         string sym = SymbolName(i, true);
         StreamSymbolTick(sym);
      }
   }
}

//+------------------------------------------------------------------+
//| Helper: Stream tick for a specific symbol                        |
//+------------------------------------------------------------------+
void StreamSymbolTick(string symbol_name) {
   if(socket_handle == INVALID_HANDLE) return;
   
   MqlTick last_tick;
   ResetLastError();
   if(SymbolInfoTick(symbol_name, last_tick)) {
      // Structure standard JSON string with newline terminator
      string json = StringFormat("{\"symbol\":\"%s\",\"bid\":%f,\"ask\":%f,\"ts\":%I64d}\n",
                                 symbol_name, last_tick.bid, last_tick.ask, last_tick.time_msc);
      
      char data[];
      int len = StringToCharArray(json, data);
      
      // Send raw byte buffer (excluding null terminator byte)
      int sent = SocketSend(socket_handle, data, len - 1);
      if(sent < 0) {
         Print("[HamaBridge] Socket send error: ", GetLastError());
         DisconnectSocket();
      }
   }
}

//+------------------------------------------------------------------+
//| Helper: Connect socket client to Linux bridge server             |
//+------------------------------------------------------------------+
bool ConnectSocket() {
   ResetLastError();
   last_reconnect_time = TimeCurrent();
   
   socket_handle = SocketCreate();
   if(socket_handle == INVALID_HANDLE) {
      Print("[HamaBridge] SocketCreate failed: ", GetLastError());
      return false;
   }
   
   if(!SocketConnect(socket_handle, Host, Port, 3000)) {
      Print("[HamaBridge] SocketConnect failed: ", GetLastError());
      SocketClose(socket_handle);
      socket_handle = INVALID_HANDLE;
      // Exponentially backoff reconnect delay up to 30s
      reconnect_delay_sec = MathMin(30, reconnect_delay_sec * 2);
      return false;
   }
   
   Print("[HamaBridge] Connected successfully to loopback server on ", Host, ":", Port);
   reconnect_delay_sec = 2; // Reset backoff delay
   
   // Enable 1-second interval timers for MarketWatch streaming and status watchdogs
   EventSetTimer(1);
   return true;
}

//+------------------------------------------------------------------+
//| Helper: Disconnect socket                                        |
//+------------------------------------------------------------------+
void DisconnectSocket() {
   EventKillTimer();
   if(socket_handle != INVALID_HANDLE) {
      SocketClose(socket_handle);
      socket_handle = INVALID_HANDLE;
   }
   Print("[HamaBridge] Disconnected socket client.");
}
