#include <node.h>
#include <node_buffer.h>
#include <string.h>
#include <stdlib.h>
#include "http_parser.h"
#include "sha.h"
#include "ws_parser.h"
#include <errno.h>

#define MAX_CONTEXTS 65536
#define READ_BUFFER 64 * 1024

using namespace v8;
using namespace node;

namespace node {

enum header_element_type { 
  NONE=0, 
  FIELD, 
  VALUE 
};

typedef enum {TCP, UNIX} socktype;

typedef struct {
  uv_write_t req;
  uv_buf_t buf;
} write_req_t;

typedef struct {
  int fd;
  int index;
  int urllength;
  int handshake;
  http_parser* parser;
  ws_parser* wsparser;
  char* key;
  char* val;
  char wskey[61];
  uint8_t headers;
  header_element_type lastel;
  uv_stream_t* handle;
  void* sock;
} _context;

typedef struct {
  int requests;
  int responses;
  int contexts;
} _stats;

typedef struct {
  int onConnect;
  int onHeaders;
  int onRequest;
  int onResponse;
  int onBody;
  int onWrite;
  int onError;
  int onMessage;
  int onClose;
} http_callbacks;

typedef struct {
  int onStart;
  int onHeader;
  int onChunk;
  int onComplete;
} websocket_callbacks;

typedef struct {
	uint8_t magic;
	uint8_t opcode;
	uint16_t keylen;
	uint8_t exlen;
	uint8_t datatype;
	uint16_t status;
	uint32_t totlen;
	uint32_t opaque;
	uint32_t cas;
	uint32_t bodylen;
	uint32_t key;
} websocket_message;

static _stats stats;
static http_parser_settings settings;
static ws_settings wssettings;
static _context* contexts[MAX_CONTEXTS];
static char r101[129];
static const char* wshash = "                        258EAFA5-E914-47DA-95CA-C5AB0DC85B11";
static Persistent<String> stats_sym;
static Persistent<String> in_sym;
static Persistent<String> out_sym;
static Persistent<String> time_sym;
static Persistent<String> requests_sym;
static Persistent<String> responses_sym;
static Persistent<String> contexts_sym;
static Persistent<String> on_connect_sym;
static Persistent<String> on_request_sym;
static Persistent<String> on_response_sym;
static Persistent<String> on_headers_sym;
static Persistent<String> on_message_sym;
static Persistent<String> on_body_sym;
static Persistent<String> on_write_sym;
static Persistent<String> on_close_sym;
static Persistent<String> on_start_sym;
static Persistent<String> on_header_sym;
static Persistent<String> on_chunk_sym;
static Persistent<String> on_complete_sym;
static Persistent<FunctionTemplate> constructor_template;

Local<Object> AddressToJS2(const sockaddr* addr) {
  static Persistent<String> address_sym;
  static Persistent<String> family_sym;
  static Persistent<String> port_sym;
  static Persistent<String> ipv4_sym;
  static Persistent<String> ipv6_sym;

  HandleScope scope;
  char ip[INET6_ADDRSTRLEN];
  const sockaddr_in *a4;
  const sockaddr_in6 *a6;
  int port;

  if (address_sym.IsEmpty()) {
    address_sym = NODE_PSYMBOL("address");
    family_sym = NODE_PSYMBOL("family");
    port_sym = NODE_PSYMBOL("port");
    ipv4_sym = NODE_PSYMBOL("IPv4");
    ipv6_sym = NODE_PSYMBOL("IPv6");
  }

  Local<Object> info = Object::New();

  switch (addr->sa_family) {
  case AF_INET6:
    a6 = reinterpret_cast<const sockaddr_in6*>(addr);
    uv_inet_ntop(AF_INET6, &a6->sin6_addr, ip, sizeof ip);
    port = ntohs(a6->sin6_port);
    info->Set(address_sym, String::New(ip));
    info->Set(family_sym, ipv6_sym);
    info->Set(port_sym, Integer::New(port));
    break;

  case AF_INET:
    a4 = reinterpret_cast<const sockaddr_in*>(addr);
    uv_inet_ntop(AF_INET, &a4->sin_addr, ip, sizeof ip);
    port = ntohs(a4->sin_port);
    info->Set(address_sym, String::New(ip));
    info->Set(family_sym, ipv4_sym);
    info->Set(port_sym, Integer::New(port));
    break;

  default:
    info->Set(address_sym, String::Empty());
  }

  return scope.Close(info);
}

class Socket : public ObjectWrap {
  private:
    http_callbacks cb;
    websocket_callbacks wcb;
    uv_buf_t buf;
    char* _in;
    Persistent<Object> _In;
    char* _out;
    Persistent<Object> _Out;
    char* _time;
    socktype type;
    Persistent<Object> _Time;
    Persistent<Function> onConnect;
    Persistent<Function> onRequest;
    Persistent<Function> onResponse;
    Persistent<Function> onMessage;
    Persistent<Function> onHeaders;
    Persistent<Function> onBody;
    Persistent<Function> onClose;
    Persistent<Function> onWrite;
    Persistent<Function> onStart;
    Persistent<Function> onChunk;
    Persistent<Function> onComplete;
    Persistent<Function> onHeader;
    
    static void context_init (Socket* server, uv_stream_t* handle) {
#if NODE_MODULE_VERSION > 10
      int fd = handle->io_watcher.fd;
#else
      int fd = handle->fd;
#endif
      _context* context;
      if(!contexts[fd]) {
        context = (_context*)calloc(sizeof(_context), 1);
        context->fd = fd;
        context->wsparser = (ws_parser*)malloc(sizeof(ws_parser));
        context->parser = (http_parser*)calloc(sizeof(http_parser), 1);
        context->parser->data = context;
        context->sock = server;
        strcpy(context->wskey, wshash);
        contexts[fd] = context;
        stats.contexts++;
      }
      else {
        context = contexts[fd];
      }
      context->index = 0;
      context->urllength = 0;
      context->handshake = 0;
      context->handle = handle;
      handle->data = context;
    }

    static void context_free (uv_handle_t* handle) {
      free(handle);
    }

    static int message_begin_cb (http_parser *p) {
      _context* ctx = (_context*)p->data;
      ctx->headers = 0;
      ctx->urllength = 0;
      Socket* s = static_cast<Socket*>(ctx->sock);
      uint8_t* rr = (uint8_t*)s->_in + 8;
      rr[0] = 0;
      rr[1] = 0;
      rr[2] = 0;
      rr[3] = 0;
      ctx->lastel = NONE;
      ctx->index = 12;
      if(s->cb.onMessage) {
        HandleScope scope;
        Local<Value> argv[1] = { Integer::New(ctx->fd) };
        s->onMessage->Call(s->handle_, 1, argv);
      }
      return 0;
    }
    
    static int url_cb (http_parser *p, const char *buf, size_t len) {
      _context* ctx = (_context*)p->data;
      Socket* s = static_cast<Socket*>(ctx->sock);
      uint8_t* rr = (uint8_t*)s->_in + ctx->index;
      memcpy(rr, buf, len);
      ctx->index += len;
      ctx->urllength += len;
      return 0;
    }
    
    static int header_field_cb (http_parser *p, const char *buf, size_t len) {
      _context* ctx = (_context*)p->data;
      Socket* s = static_cast<Socket*>(ctx->sock);
      if(ctx->lastel != FIELD) {
        ctx->headers++;
      }
      uint8_t* rr = (uint8_t*)s->_in + ctx->index;
      rr[0] = 0xff & (len>>8);
      rr[1] = 0xff & len;
      memcpy(rr + 2, buf, len);
      ctx->key = (char*)(rr + 2);
      ctx->index += (len + 2);
      ctx->lastel = FIELD;
      return 0;
    }
    
    static int header_value_cb (http_parser *p, const char *buf, size_t len) {
      _context* ctx = (_context*)p->data;
      Socket* s = static_cast<Socket*>(ctx->sock);
      uint8_t* rr = (uint8_t*)s->_in + ctx->index;
      rr[0] = 0xff & (len>>8);
      rr[1] = 0xff & len;
      memcpy(rr + 2, buf, len);
      ctx->val = (char*)(rr + 2);
      if(strncasecmp(ctx->key, "Sec-WebSocket-Key", 17) == 0) {
        strncpy(ctx->wskey, ctx->val, 24);
      }
      ctx->index += (len + 2);
      ctx->lastel = VALUE;
      return 0;
    }
    
    static int body_cb (http_parser *p, const char *buf, size_t len) {
      HandleScope scope;
      if(len > 0) {
        _context* ctx = (_context*)p->data;
        Socket* s = static_cast<Socket*>(ctx->sock);
        if(s->cb.onBody) {
          memcpy(s->_in, buf, len);
          Local<Value> argv[2] = { Integer::New(ctx->fd), Integer::New(len) };
          s->onBody->Call(s->handle_, 2, argv);
        }
      }
      return 0;
    }

    static int headers_complete_cb (http_parser *p) {
      _context* ctx = (_context*)p->data;
      Socket* s = static_cast<Socket*>(ctx->sock);
      if(s->cb.onHeaders) {
        HandleScope scope;
        uint8_t* rr = (uint8_t*)s->_in;
        rr[0] = p->http_major;
        rr[1] = p->http_minor;
        rr[2] = ctx->headers;
        rr[3] = (http_method)p->method;
        rr[4] = p->upgrade;
        rr[5] = http_should_keep_alive(p);
        rr[6] = 0xff & (p->status_code >> 8);
        rr[7] = 0xff & (p->status_code);
        rr[8] = 0xff & (ctx->urllength>>24);
        rr[9] = 0xff & (ctx->urllength>>16);
        rr[10] = 0xff & (ctx->urllength>>8);
        rr[11] = 0xff & ctx->urllength;
        Local<Value> argv[1] = { Integer::New(ctx->fd) };
        s->onHeaders->Call(s->handle_, 1, argv);
      }
      stats.requests++;
      return 0;
    }
    
    static int message_complete_cb (http_parser *p) {
      _context* ctx = (_context*)p->data;
      Socket* s = static_cast<Socket*>(ctx->sock);
      if(s->cb.onRequest) {
        HandleScope scope;
        Local<Value> argv[1] = { Integer::New(ctx->fd) };
        s->onRequest->Call(s->handle_, 1, argv);
      }
      else if(s->cb.onResponse) {
        HandleScope scope;
        Local<Value> argv[1] = { Integer::New(ctx->fd) };
        s->onResponse->Call(s->handle_, 1, argv);
      }
      return 0;
    }
    
    static int ws_header_cb(ws_parser* p) {
      HandleScope scope;
      _context* context = (_context*)p->data;
      Socket* s = static_cast<Socket*>(context->sock);
      if(s->wcb.onHeader) {
        uint8_t* rr = (uint8_t*)s->_in;
        rr[0] = p->header.fin & 0xff;
        rr[1] = p->header.reserved[0] & 0xff;
        rr[2] = p->header.reserved[1] & 0xff;
        rr[3] = p->header.reserved[2] & 0xff;
        rr[4] = p->header.opcode & 0xff;
        rr[5] = p->header.mask & 0xff;
        rr[6] = 0xff & (p->header.length>>24);
        rr[7] = 0xff & (p->header.length>>16);
        rr[8] = 0xff & (p->header.length>>8);
        rr[9] = 0xff & p->header.length;
        rr[10] = p->header.maskkey[0] & 0xff;
        rr[11] = p->header.maskkey[1] & 0xff;
        rr[12] = p->header.maskkey[2] & 0xff;
        rr[13] = p->header.maskkey[2] & 0xff;
        Local<Value> argv[1] = { Integer::New(context->fd) };
        s->onHeader->Call(s->handle_, 1, argv);
      }
      return 0;
    }
    
    static int ws_chunk_cb(ws_parser* p, const char* at, size_t len) {
      HandleScope scope;
      _context* context = (_context*)p->data;
      Socket* s = static_cast<Socket*>(context->sock);
      if(s->wcb.onChunk) {
        uint8_t* rr = (uint8_t*)s->_in;
        memcpy(rr, at, len);
        Local<Value> argv[2] = { Integer::New(context->fd), Integer::New(len)};
        switch(p->header.opcode) {
          case 0x01: // UTF-8 Text
            break;
          case 0x02: // Binary
            break;
          case 0x03: // Reserved
          case 0x04: // Reserved
          case 0x05: // Reserved
          case 0x06: // Reserved
          case 0x07: // Reserved
            break;
          case 0x08: // Close
            uv_close((uv_handle_t*)context->handle, on_close);
            break;
          case 0x09: // Ping
            break;
          case 0x0A: // Pong
            break;
        }
        s->onChunk->Call(s->handle_, 2, argv);
      }
      return 0;
    }
    
    static int ws_complete_cb(ws_parser* p) {
      HandleScope scope;
      _context* context = (_context*)p->data;
      Socket* s = static_cast<Socket*>(context->sock);
      if(s->wcb.onComplete) {
        Local<Value> argv[1] = { Integer::New(context->fd) };
        s->onComplete->Call(s->handle_, 1, argv);
      }
      return 0;
    }

    static void after_write(uv_write_t* req, int status) {
      write_req_t* wr;
      wr = (write_req_t*) req;
      if (status) {
        free(wr);
        uv_err_t err = uv_last_error(uv_default_loop());
        fprintf(stderr, "uv_write error: %s\n", uv_strerror(err));
        return;
      }
      uv_stream_t* s = (uv_stream_t*)wr->req.handle;
#if NODE_MODULE_VERSION > 10
      _context* ctx = contexts[s->io_watcher.fd];
#else
      _context* ctx = contexts[s->fd];
#endif
      Socket* socket = static_cast<Socket*>(ctx->sock);
      if(socket->cb.onWrite) {
        HandleScope scope;
        Local<Value> argv[3] = { Integer::New(ctx->fd), Integer::New(wr->req.write_index), Integer::New(status) };
        socket->onWrite->Call(socket->handle_, 3, argv);
      }
      free(wr);
    }

    static void after_writeandcopy(uv_write_t* req, int status) {
      write_req_t* wr;
      wr = (write_req_t*) req;
      if (status) {
        free(wr->buf.base);
        free(wr);
        uv_err_t err = uv_last_error(uv_default_loop());
        fprintf(stderr, "uv_write error: %s\n", uv_strerror(err));
        return;
      }
      uv_stream_t* s = (uv_stream_t*)wr->req.handle;
#if NODE_MODULE_VERSION > 10
      _context* ctx = contexts[s->io_watcher.fd];
#else
      _context* ctx = contexts[s->fd];
#endif
      Socket* socket = static_cast<Socket*>(ctx->sock);
      if(socket->cb.onWrite) {
        HandleScope scope;
        Local<Value> argv[3] = { Integer::New(ctx->fd), Integer::New(wr->req.write_index), Integer::New(status) };
        socket->onWrite->Call(socket->handle_, 3, argv);
      }
      free(wr->buf.base);
      free(wr);
    }

    static void after_read(uv_stream_t* handle, ssize_t nread, uv_buf_t buf) {
      if (nread < 0) {
        uv_close((uv_handle_t*)handle, on_close);
        return;
      }
      if (nread == 0) {
        return;
      }
      _context* ctx = (_context*)handle->data;
      ssize_t np = 0;
      if(ctx->handshake == 1) {
        np = ws_execute(ctx->wsparser, &wssettings, buf.base, 0, nread);
      }
      else {
        np = http_parser_execute(ctx->parser, &settings, buf.base, nread);
      }
      if(np != nread) {
        fprintf(stderr, "parser error: %li\n", np);
        uv_shutdown_t* req;
        req = (uv_shutdown_t*) malloc(sizeof *req);
        uv_shutdown(req, handle, after_shutdown);
      }
    }
    
    static uv_buf_t echo_alloc(uv_handle_t* handle, size_t suggested_size) {
      _context* ctx = (_context*)handle->data;
      Socket* s = static_cast<Socket*>(ctx->sock);
      return s->buf;
      //return uv_buf_init((char*)malloc(suggested_size), suggested_size);
    }

    static void on_close(uv_handle_t* peer) {
      _context* ctx = (_context*)peer->data;
      Socket* s = static_cast<Socket*>(ctx->sock);
      if(s->cb.onClose) {
        HandleScope scope;
        Local<Value> argv[1] = { Integer::New(ctx->fd) };
        s->onClose->Call(s->handle_, 1, argv);
      }
      context_free(peer);
    }
    
    static void after_shutdown(uv_shutdown_t* req, int status) {
      uv_close((uv_handle_t*)req->handle, on_close);
      free(req);
    }
    
    static void on_server_connection(uv_stream_t* server, int status) {
      HandleScope scope;
      Socket* s = static_cast<Socket*>(server->data);
      uv_stream_t* stream;
      if (status != 0) {
        Socket* s = static_cast<Socket*>(server->data);
        if(s->cb.onConnect) {
          SetErrno(uv_last_error(uv_default_loop()));
          Local<Value> argv[2] = { Integer::New(0), Integer::New(status) };
          s->onConnect->Call(s->handle_, 2, argv);
        }
        return;
      }
      if(s->type == TCP) {
        stream = (uv_stream_t*)malloc(sizeof(uv_tcp_t));
        int r = uv_tcp_init(uv_default_loop(), (uv_tcp_t*)stream);
        if(r != 0) {
          if(s->cb.onConnect) {
            SetErrno(uv_last_error(uv_default_loop()));
            Local<Value> argv[2] = { Integer::New(0), Integer::New(r) };
            s->onConnect->Call(s->handle_, 2, argv);
          }
          return;
        }
      }
      else {
        stream = (uv_stream_t*)malloc(sizeof(uv_pipe_t));
        int r = uv_pipe_init(uv_default_loop(), (uv_pipe_t*)stream, 0);
        if(r != 0) {
          if(s->cb.onConnect) {
            SetErrno(uv_last_error(uv_default_loop()));
            Local<Value> argv[2] = { Integer::New(0), Integer::New(r) };
            s->onConnect->Call(s->handle_, 2, argv);
          }
          return;
        }
      }
      int r = uv_accept(server, stream);
      if(r != 0) {
        if(s->cb.onConnect) {
          SetErrno(uv_last_error(uv_default_loop()));
          Local<Value> argv[2] = { Integer::New(0), Integer::New(r) };
          s->onConnect->Call(s->handle_, 2, argv);
        }
        return;
      }
      context_init(s, stream);
      _context* ctx = (_context*)stream->data;
      http_parser_init(ctx->parser, HTTP_REQUEST);
      r = uv_read_start(stream, echo_alloc, after_read);
      if(s->cb.onConnect) {
        Local<Value> argv[2] = { Integer::New(ctx->fd), Integer::New(r) };
        s->onConnect->Call(s->handle_, 2, argv);
      }
    }

    static void on_client_connection(uv_connect_t* client, int status) {
      HandleScope scope;
      Socket* s = static_cast<Socket*>(client->data);
      if(status != 0) {
        if(s->cb.onConnect) {
          Local<Value> argv[2] = { Integer::New(0), Integer::New(status) };
          s->onConnect->Call(s->handle_, 2, argv);
        }
        return;
      }
      if(!uv_is_readable(client->handle) || !uv_is_writable(client->handle) || uv_is_closing((uv_handle_t *)client->handle)) {
        if(s->cb.onConnect) {
          SetErrno(uv_last_error(uv_default_loop()));
          Local<Value> argv[2] = { Integer::New(0), Integer::New(-1) };
          s->onConnect->Call(s->handle_, 2, argv);
        }
        return;
      }
      context_init(s, client->handle);
      _context* ctx = (_context*)client->handle->data;
      http_parser_init(ctx->parser, HTTP_RESPONSE);
      int r = uv_read_start(client->handle, echo_alloc, after_read);
      if(s->cb.onConnect) {
        Local<Value> argv[2] = { Integer::New(ctx->fd), Integer::New(r) };
        s->onConnect->Call(s->handle_, 2, argv);
      }
    }

  public:
    static Handle<Value> GetStats(Local<String> property, const v8::AccessorInfo& info) {
      HandleScope scope;
      Local<Object> s = Object::New();
      s->Set(requests_sym, Integer::New(stats.requests));
      s->Set(responses_sym, Integer::New(stats.responses));
      s->Set(contexts_sym, Integer::New(stats.contexts));
      return scope.Close(s);
    }

    static Handle<Value> GetIn(Local<String> property, const v8::AccessorInfo& info) {
      Socket *s = ObjectWrap::Unwrap<Socket>(info.This());
      return s->_In;
    }

    static void SetIn(Local<String> property, Local<Value> value, const v8::AccessorInfo& info) {
      HandleScope scope;
      Socket *s = ObjectWrap::Unwrap<Socket>(info.This());
      Local<Object> buffer_obj = value->ToObject();
      s->_in = Buffer::Data(buffer_obj);
      s->_In = Persistent<Object>::New(buffer_obj);
    }

    static Handle<Value> GetOut(Local<String> property, const v8::AccessorInfo& info) {
      Socket *s = ObjectWrap::Unwrap<Socket>(info.This());
      return s->_Out;
    }

    static void SetOut(Local<String> property, Local<Value> value, const v8::AccessorInfo& info) {
      HandleScope scope;
      Socket *s = ObjectWrap::Unwrap<Socket>(info.This());
      Local<Object> buffer_obj = value->ToObject();
      s->_out = Buffer::Data(buffer_obj);
      s->_Out = Persistent<Object>::New(buffer_obj);
    }

    static void SetTime(Local<String> property, Local<Value> value, const v8::AccessorInfo& info) {
      HandleScope scope;
      Socket *s = ObjectWrap::Unwrap<Socket>(info.This());
      Local<Object> buffer_obj = value->ToObject();
      s->_time = Buffer::Data(buffer_obj);
      s->_Time = Persistent<Object>::New(buffer_obj);
    }

    static void Initialize (v8::Handle<v8::Object> target)
    {
      HandleScope scope;
      Local<FunctionTemplate> t = FunctionTemplate::New(Socket::New);
      constructor_template = Persistent<FunctionTemplate>::New(t);
      t->InstanceTemplate()->SetInternalFieldCount(1);
      t->SetClassName(String::NewSymbol("Socket"));

      on_connect_sym = NODE_PSYMBOL("onConnect");
      on_request_sym = NODE_PSYMBOL("onRequest");
      on_response_sym = NODE_PSYMBOL("onResponse");
      on_headers_sym = NODE_PSYMBOL("onHeaders");
      on_message_sym = NODE_PSYMBOL("onMessage");
      on_body_sym = NODE_PSYMBOL("onBody");
      on_write_sym = NODE_PSYMBOL("onWrite");
      on_close_sym = NODE_PSYMBOL("onClose");
			on_start_sym = NODE_PSYMBOL("onStart");
			on_header_sym = NODE_PSYMBOL("onHeader");
			on_chunk_sym = NODE_PSYMBOL("onChunk");
			on_complete_sym = NODE_PSYMBOL("onComplete");
      
      in_sym = NODE_PSYMBOL("in");
      out_sym = NODE_PSYMBOL("out");
      time_sym = NODE_PSYMBOL("time");
      stats_sym = NODE_PSYMBOL("stats");
      requests_sym = NODE_PSYMBOL("requests");
      responses_sym = NODE_PSYMBOL("responses");
      contexts_sym = NODE_PSYMBOL("contexts");

      NODE_SET_PROTOTYPE_METHOD(t, "listen", Socket::Listen);
      NODE_SET_PROTOTYPE_METHOD(t, "write", Socket::Write);
      NODE_SET_PROTOTYPE_METHOD(t, "writeCopy", Socket::WriteCopy);
      NODE_SET_PROTOTYPE_METHOD(t, "writeTime", Socket::WriteTime);
      NODE_SET_PROTOTYPE_METHOD(t, "close", Socket::Close);
      NODE_SET_PROTOTYPE_METHOD(t, "pause", Socket::Pause);
      NODE_SET_PROTOTYPE_METHOD(t, "resume", Socket::Resume);
      NODE_SET_PROTOTYPE_METHOD(t, "slice", Socket::Slice);
      NODE_SET_PROTOTYPE_METHOD(t, "connect", Socket::Connect);
      NODE_SET_PROTOTYPE_METHOD(t, "upgrade", Socket::Upgrade);
      NODE_SET_PROTOTYPE_METHOD(t, "setCallbacks", Socket::BindCallbacks);
      // TCP ONLY
      NODE_SET_PROTOTYPE_METHOD(t, "setNoDelay", Socket::SetNoDelay);
      NODE_SET_PROTOTYPE_METHOD(t, "setKeepAlive", Socket::SetKeepAlive);
      NODE_SET_PROTOTYPE_METHOD(t, "getPeerName", Socket::GetPeerName);

      settings.on_message_begin = message_begin_cb;
      settings.on_header_field = header_field_cb;
      settings.on_header_value = header_value_cb;
      settings.on_url = url_cb;
      settings.on_body = body_cb;
      settings.on_headers_complete = headers_complete_cb;
      settings.on_message_complete = message_complete_cb;
      
      wssettings.on_header = ws_header_cb;
      wssettings.on_chunk = ws_chunk_cb;
      wssettings.on_complete = ws_complete_cb;

      t->InstanceTemplate()->SetAccessor(stats_sym, Socket::GetStats, NULL);
      t->InstanceTemplate()->SetAccessor(in_sym, Socket::GetIn, Socket::SetIn);
      t->InstanceTemplate()->SetAccessor(out_sym, Socket::GetOut, Socket::SetOut);
      t->InstanceTemplate()->SetAccessor(time_sym, NULL, Socket::SetTime);
      
      strncpy(r101, "HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept:                             \r\n\r\n", 129);
      
      target->Set(String::NewSymbol("Socket"), t->GetFunction());
    }

  protected:
    static Handle<Value> New (const Arguments& args)
    {
      HandleScope scope;
      Socket *server = new Socket();
      server->cb.onResponse = server->cb.onMessage = server->cb.onWrite = server->cb.onError = server->cb.onClose = server->cb.onRequest = server->cb.onBody = server->cb.onHeaders = server->cb.onConnect = 0;
      server->Wrap(args.Holder());
      server->type = TCP;
      if(args.Length() > 0) {
        uint32_t type = args[0]->Int32Value();
        server->type = type==0?TCP:UNIX;
      }
      server->Ref();
      server->buf = uv_buf_init((char*)calloc(READ_BUFFER, 1), READ_BUFFER);
      return args.This();
    }

    static Handle<Value> BindCallbacks(const Arguments &args) {
      HandleScope scope;
      Socket *s = ObjectWrap::Unwrap<Socket>(args.Holder());
      s->cb.onConnect = 0;
      if(s->handle_->HasOwnProperty(on_connect_sym)) {
        Local<Value> onConnect = s->handle_->Get(on_connect_sym);
        if (onConnect->IsFunction()) {
          s->onConnect = Persistent<Function>::New(Local<Function>::Cast(onConnect));
          s->cb.onConnect = 1;
        }
      }
      s->cb.onHeaders = 0;
      if(s->handle_->HasOwnProperty(on_headers_sym)) {
        Local<Value> onHeaders = s->handle_->Get(on_headers_sym);
        if (onHeaders->IsFunction()) {
          s->onHeaders = Persistent<Function>::New(Local<Function>::Cast(onHeaders));
          s->cb.onHeaders = 1;
        }
      }
      s->cb.onRequest = 0;
      if(s->handle_->HasOwnProperty(on_request_sym)) {
        Local<Value> onRequest = s->handle_->Get(on_request_sym);
        if (onRequest->IsFunction()) {
          s->onRequest = Persistent<Function>::New(Local<Function>::Cast(onRequest));
          s->cb.onRequest = 1;
        }
      }
      s->cb.onMessage = 0;
      if(s->handle_->HasOwnProperty(on_message_sym)) {
        Local<Value> onMessage = s->handle_->Get(on_message_sym);
        if (onMessage->IsFunction()) {
          s->onMessage = Persistent<Function>::New(Local<Function>::Cast(onMessage));
          s->cb.onMessage = 1;
        }
      }
      s->cb.onBody = 0;
      if(s->handle_->HasOwnProperty(on_body_sym)) {
        Local<Value> onBody = s->handle_->Get(on_body_sym);
        if (onBody->IsFunction()) {
          s->onBody = Persistent<Function>::New(Local<Function>::Cast(onBody));
          s->cb.onBody = 1;
        }
      }
      s->cb.onWrite = 0;
      if(s->handle_->HasOwnProperty(on_write_sym)) {
        Local<Value> onWrite = s->handle_->Get(on_write_sym);
        if (onWrite->IsFunction()) {
          s->onWrite = Persistent<Function>::New(Local<Function>::Cast(onWrite));
          s->cb.onWrite = 1;
        }
      }
      s->cb.onClose = 0;
      if(s->handle_->HasOwnProperty(on_close_sym)) {
        Local<Value> onClose = s->handle_->Get(on_close_sym);
        if (onClose->IsFunction()) {
          s->onClose = Persistent<Function>::New(Local<Function>::Cast(onClose));
          s->cb.onClose = 1;
        }
      }
      s->cb.onResponse = 0;
      if(s->handle_->HasOwnProperty(on_response_sym)) {
        Local<Value> onResponse = s->handle_->Get(on_response_sym);
        if (onResponse->IsFunction()) {
          s->onResponse = Persistent<Function>::New(Local<Function>::Cast(onResponse));
          s->cb.onResponse = 1;
        }
      }
      
      s->wcb.onStart = 0;
      if(s->handle_->HasOwnProperty(on_start_sym)) {
        Local<Value> onStart = s->handle_->Get(on_start_sym);
        if (onStart->IsFunction()) {
          s->onStart = Persistent<Function>::New(Local<Function>::Cast(onStart));
          s->wcb.onStart = 1;
        }
      }
      s->wcb.onHeader = 0;
      if(s->handle_->HasOwnProperty(on_header_sym)) {
        Local<Value> onHeader = s->handle_->Get(on_header_sym);
        if (onHeader->IsFunction()) {
          s->onHeader = Persistent<Function>::New(Local<Function>::Cast(onHeader));
          s->wcb.onHeader = 1;
        }
      }
      s->wcb.onChunk = 0;
      if(s->handle_->HasOwnProperty(on_chunk_sym)) {
        Local<Value> onChunk = s->handle_->Get(on_chunk_sym);
        if (onChunk->IsFunction()) {
          s->onChunk = Persistent<Function>::New(Local<Function>::Cast(onChunk));
          s->wcb.onChunk = 1;
        }
      }
      s->wcb.onComplete = 0;
      if(s->handle_->HasOwnProperty(on_complete_sym)) {
        Local<Value> onComplete = s->handle_->Get(on_complete_sym);
        if (onComplete->IsFunction()) {
          s->onComplete = Persistent<Function>::New(Local<Function>::Cast(onComplete));
          s->wcb.onComplete = 1;
        }
      }
      return Null();
    }
    
    static Handle<Value> Slice(const Arguments &args) {
      Socket *s = ObjectWrap::Unwrap<Socket>(args.Holder());
      int32_t off = args[0]->Int32Value();
      int32_t len = args[1]->Int32Value();
      char* data = s->_in + off;
      return String::New(data, len);
    }
    
    static Handle<Value> Upgrade(const Arguments &args) {
      HandleScope scope;
      int fd = args[0]->Int32Value();
      _context* ctx = contexts[fd];
      ws_init(ctx->wsparser);
      ctx->wsparser->data = ctx;
      Socket* s = static_cast<Socket*>(ctx->sock);
      write_req_t *wr;
      wr = (write_req_t*) malloc(sizeof *wr);
      shacalc(ctx->wskey, (r101 + 97));
      wr->buf = uv_buf_init(r101, 129);
      if (uv_write(&wr->req, ctx->handle, &wr->buf, 1, after_write)) {
        exit(1);
      }
      ctx->handshake = 1;
      if(s->wcb.onStart) {
        Local<Value> argv[1] = { Integer::New(ctx->fd) };
        s->onStart->Call(s->handle_, 1, argv);
      }
      return scope.Close(Integer::New(wr->req.write_index));
    }

    static Handle<Value> Write(const Arguments &args) {
      HandleScope scope;
      int fd = args[0]->Int32Value();
      int off = args[1]->Int32Value();
      int len = args[2]->Int32Value();
      _context* ctx = contexts[fd];
      write_req_t *wr;
      wr = (write_req_t*) malloc(sizeof *wr);
      Socket* s = static_cast<Socket*>(ctx->sock);
      char* src = s->_out + off;
      wr->buf = uv_buf_init(src, len);
      int r = uv_write(&wr->req, ctx->handle, &wr->buf, 1, after_write);
      return scope.Close(Integer::New(r));
    }

    static Handle<Value> WriteCopy(const Arguments &args) {
      HandleScope scope;
      int fd = args[0]->Int32Value();
      int off = args[1]->Int32Value();
      int len = args[2]->Int32Value();
      _context* ctx = contexts[fd];
      write_req_t *wr;
      wr = (write_req_t*) malloc(sizeof *wr);
      Socket* s = static_cast<Socket*>(ctx->sock);
      char* towrite = (char*)malloc(len);
      char* src = s->_out + off;
      memcpy(towrite, src, len);
      wr->buf = uv_buf_init(towrite, len);
      int r = uv_write(&wr->req, ctx->handle, &wr->buf, 1, after_writeandcopy);
      return scope.Close(Integer::New(r));
    }
    
    static Handle<Value> WriteTime(const Arguments &args) {
      HandleScope scope;
      int fd = args[0]->Int32Value();
      int off = args[1]->Int32Value();
      int len = args[2]->Int32Value();
      _context* ctx = contexts[fd];
      write_req_t *wr;
      wr = (write_req_t*) malloc(sizeof *wr);
      Socket* s = static_cast<Socket*>(ctx->sock);
      char* src = s->_out + off;
      char* tt = src + 25;
      memcpy(tt, s->_time, 29);
      wr->buf = uv_buf_init(src, len);
      int r = uv_write(&wr->req, ctx->handle, &wr->buf, 1, after_write);
      return scope.Close(Integer::New(r));
    }

    static Handle<Value> Close(const Arguments &args) {
      HandleScope scope;
      int fd = args[0]->Int32Value();
      _context* ctx = contexts[fd];
      uv_shutdown_t* req;
      req = (uv_shutdown_t*) malloc(sizeof *req);
      uv_shutdown(req, ctx->handle, after_shutdown);
      return scope.Close(Integer::New(1));
    }

    static Handle<Value> Pause(const Arguments &args) {
      HandleScope scope;
      int fd = args[0]->Int32Value();
      _context* ctx = contexts[fd];
      int r = uv_read_stop(ctx->handle);
      if (r) SetErrno(uv_last_error(uv_default_loop()));
      return scope.Close(Integer::New(r));
    }

    static Handle<Value> Resume(const Arguments &args) {
      HandleScope scope;
      int fd = args[0]->Int32Value();
      _context* ctx = contexts[fd];
      int r = uv_read_start(ctx->handle, echo_alloc, after_read);
      if (r) SetErrno(uv_last_error(uv_default_loop()));
      return scope.Close(Integer::New(r));
    }

    static Handle<Value> SetNoDelay(const Arguments& args) {
      HandleScope scope;
      Socket *s = ObjectWrap::Unwrap<Socket>(args.Holder());
      if(s->type != TCP) return scope.Close(Integer::New(-1));
      int fd = args[0]->Int32Value();
      _context* ctx = contexts[fd];
      int enable = static_cast<int>(args[1]->BooleanValue());
      int r = uv_tcp_nodelay((uv_tcp_t*)ctx->handle, enable);
      if (r) SetErrno(uv_last_error(uv_default_loop()));
      return scope.Close(Integer::New(r));
    }

    static Handle<Value> SetKeepAlive(const Arguments& args) {
      HandleScope scope;
      Socket *s = ObjectWrap::Unwrap<Socket>(args.Holder());
      if(s->type != TCP) return scope.Close(Integer::New(-1));
      int fd = args[0]->Int32Value();
      _context* ctx = contexts[fd];
      int enable = static_cast<int>(args[1]->BooleanValue());
      unsigned int delay = args[2]->Uint32Value();
      int r = uv_tcp_keepalive((uv_tcp_t*)ctx->handle, enable, delay);
      if (r) SetErrno(uv_last_error(uv_default_loop()));
      return scope.Close(Integer::New(r));
    }

    static Handle<Value> Connect(const Arguments& args) {
      HandleScope scope;
      Socket *s = ObjectWrap::Unwrap<Socket>(args.Holder());
      int r = 0;
      if(s->type == TCP) {
        String::AsciiValue ip_address(args[0]);
        int port = args[1]->Int32Value();
        struct sockaddr_in address = uv_ip4_addr(*ip_address, port);
        uv_tcp_t* sock = (uv_tcp_t*)malloc(sizeof(uv_tcp_t));
        sock->data = s;
        r = uv_tcp_init(uv_default_loop(), sock);
        uv_connect_t* cn_wrap = (uv_connect_t*)malloc(sizeof(uv_connect_t));
        r = uv_tcp_connect(cn_wrap, sock, address, on_client_connection);
        if (r) {
          SetErrno(uv_last_error(uv_default_loop()));
          free(cn_wrap);
        }
      }
      else {
        String::AsciiValue path(args[0]);
        uv_pipe_t* sock = (uv_pipe_t*)malloc(sizeof(uv_pipe_t));
        sock->data = s;
        int r = uv_pipe_init(uv_default_loop(), sock, 0);
        uv_connect_t* cn_wrap = (uv_connect_t*)malloc(sizeof(uv_connect_t));
        uv_pipe_connect(cn_wrap, sock, *path, on_client_connection);
        if (r) {
          SetErrno(uv_last_error(uv_default_loop()));
          free(cn_wrap);
        }
      }
      return scope.Close(Integer::New(r));
    }

    static Handle<Value> GetPeerName(const Arguments& args) {
      HandleScope scope;
      Socket *s = ObjectWrap::Unwrap<Socket>(args.Holder());
      if(s->type != TCP) return Null();
      struct sockaddr_storage address;
      int fd = args[0]->Int32Value();
      _context* ctx = contexts[fd];
      int addrlen = sizeof(address);
      int r = uv_tcp_getpeername((uv_tcp_t*)ctx->handle,
                                 reinterpret_cast<sockaddr*>(&address),
                                 &addrlen);
      if (r) {
        SetErrno(uv_last_error(uv_default_loop()));
        return Null();
      }
      const sockaddr* addr = reinterpret_cast<const sockaddr*>(&address);
      return scope.Close(AddressToJS2(addr));
    }
    
    static Handle<Value> Listen(const Arguments &args) {
      HandleScope scope;
      Socket *s = ObjectWrap::Unwrap<Socket>(args.Holder());
      int r = 0;
      if(s->type == TCP) {
        String::AsciiValue ip_address(args[0]->ToString());
        int port = args[1]->Int32Value();
        uv_tcp_t* sock = (uv_tcp_t*)malloc(sizeof(uv_tcp_t));
        sock->data = s;
        struct sockaddr_in addr = uv_ip4_addr(*ip_address, port);
        r = uv_tcp_init(uv_default_loop(), sock);
        if (r) {
          fprintf(stderr, "Socket creation error\n");
          r = -1;
        }
        else {
          r = uv_tcp_bind(sock, addr);
          if (r) {
            fprintf(stderr, "Bind error\n");
            r = -2;
          }
          else {
            r = uv_listen((uv_stream_t*)sock, SOMAXCONN, on_server_connection);
            if (r) {
              fprintf(stderr, "Listen error\n");
              r = -3;
            }
          }
        }
      }
      else {
        String::AsciiValue path(args[0]->ToString());
        uv_pipe_t* sock = (uv_pipe_t*)calloc(1, sizeof(uv_pipe_t));
        sock->data = s;
        r = uv_pipe_init(uv_default_loop(), sock, 0);
        if (r) {
          fprintf(stderr, "Socket creation error\n");
          r = -1;
        }
        else {
          r = uv_pipe_bind(sock, *path);
          if (r) {
            fprintf(stderr, "Bind error\n");
            r = -2;
          }
          else {
            r = uv_listen((uv_stream_t*)sock, SOMAXCONN, on_server_connection);
            if (r) {
              fprintf(stderr, "Listen error\n");
              r = -3;
            }
          }
        }
      }
      return scope.Close(Integer::New(r));
    }

    Socket () : ObjectWrap () 
    {
    }

    ~Socket ()
    {
    }
};
}
NODE_MODULE(httpd, node::Socket::Initialize)