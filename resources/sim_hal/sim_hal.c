#include "sim_hal.h"

// ── GPIO state ─────────────────────────────────────────────────────────────
#define GPIO_MAX 40
static int              gpio_state[GPIO_MAX] = {0};
static pthread_mutex_t  gpio_mutex  = PTHREAD_MUTEX_INITIALIZER;
static pthread_mutex_t  out_mutex   = PTHREAD_MUTEX_INITIALIZER;

// ── JSON helpers ───────────────────────────────────────────────────────────
static void json_string(const char* s, char* out, size_t outlen) {
  size_t j = 0;
  out[j++] = '"';
  for (size_t i = 0; s[i] && j < outlen - 4; i++) {
    unsigned char c = (unsigned char)s[i];
    if      (c == '"')  { out[j++] = '\\'; out[j++] = '"'; }
    else if (c == '\\') { out[j++] = '\\'; out[j++] = '\\'; }
    else if (c == '\n') { out[j++] = '\\'; out[j++] = 'n'; }
    else if (c == '\r') { out[j++] = '\\'; out[j++] = 'r'; }
    else if (c < 0x20)  { /* skip control chars */ }
    else                { out[j++] = (char)c; }
  }
  out[j++] = '"';
  out[j]   = '\0';
}

// ── Logging ────────────────────────────────────────────────────────────────
void sim_log(char level, const char* tag, const char* fmt, ...) {
  char msg[512];
  va_list ap;
  va_start(ap, fmt);
  vsnprintf(msg, sizeof(msg), fmt, ap);
  va_end(ap);

  char jmsg[600], jtag[128];
  json_string(msg, jmsg, sizeof(jmsg));
  json_string(tag, jtag, sizeof(jtag));

  pthread_mutex_lock(&out_mutex);
  printf("{\"t\":\"log\",\"level\":\"%c\",\"tag\":%s,\"msg\":%s}\n", level, jtag, jmsg);
  fflush(stdout);
  pthread_mutex_unlock(&out_mutex);
}

// ── GPIO ───────────────────────────────────────────────────────────────────
esp_err_t gpio_reset_pin(gpio_num_t pin)                       { return ESP_OK; }
esp_err_t gpio_set_direction(gpio_num_t pin, gpio_mode_t mode) { return ESP_OK; }

esp_err_t gpio_set_pull_mode(gpio_num_t pin, gpio_pull_mode_t mode) {
  if (pin >= 0 && pin < GPIO_MAX &&
      (mode == GPIO_PULLUP_ONLY || mode == GPIO_PULLUP_PULLDOWN)) {
    // Pulled-up input idles HIGH; polling tasks must start with last_ = 1.
    pthread_mutex_lock(&gpio_mutex);
    gpio_state[pin] = 1;
    pthread_mutex_unlock(&gpio_mutex);
  }
  return ESP_OK;
}

esp_err_t gpio_set_level(gpio_num_t pin, uint32_t level) {
  if (pin < 0 || pin >= GPIO_MAX) return ESP_FAIL;
  int val = level ? 1 : 0;

  pthread_mutex_lock(&gpio_mutex);
  gpio_state[pin] = val;
  pthread_mutex_unlock(&gpio_mutex);

  pthread_mutex_lock(&out_mutex);
  printf("{\"t\":\"gpio\",\"pin\":%d,\"val\":%d}\n", pin, val);
  fflush(stdout);
  pthread_mutex_unlock(&out_mutex);

  return ESP_OK;
}

int gpio_get_level(gpio_num_t pin) {
  if (pin < 0 || pin >= GPIO_MAX) return 0;
  pthread_mutex_lock(&gpio_mutex);
  int v = gpio_state[pin];
  pthread_mutex_unlock(&gpio_mutex);
  return v;
}

// ── FreeRTOS ───────────────────────────────────────────────────────────────
TickType_t xTaskGetTickCount(void) {
  struct timespec ts;
  clock_gettime(CLOCK_MONOTONIC, &ts);
  return (TickType_t)(ts.tv_sec * 1000 + ts.tv_nsec / 1000000);
}

typedef struct { TaskFunction_t fn; void* arg; } TaskArgs;

static void* task_wrapper(void* p) {
  TaskArgs* a = (TaskArgs*)p;
  TaskFunction_t fn = a->fn;
  void* arg = a->arg;
  free(a);
  fn(arg);
  return NULL;
}

BaseType_t xTaskCreate(TaskFunction_t fn, const char* name,
                       uint32_t stack, void* arg,
                       int prio, TaskHandle_t* out) {
  (void)name; (void)stack; (void)prio;
  pthread_t t;
  TaskArgs* a = (TaskArgs*)malloc(sizeof(TaskArgs));
  a->fn = fn;
  a->arg = arg;
  pthread_create(&t, NULL, task_wrapper, a);
  pthread_detach(t);
  if (out) *out = (TaskHandle_t)(uintptr_t)t;
  return pdTRUE;
}

void vTaskDelay(TickType_t ticks) {
  if (ticks == 0) return;
  usleep((useconds_t)(ticks * 1000));
}

void vTaskDelayUntil(TickType_t* prev, TickType_t inc) {
  TickType_t target = *prev + inc;
  TickType_t now    = xTaskGetTickCount();
  if (target > now) {
    usleep((useconds_t)((target - now) * 1000));
  }
  *prev = xTaskGetTickCount();
}

// ── NVS (stub) ─────────────────────────────────────────────────────────────
esp_err_t nvs_flash_init(void) { return ESP_OK; }

// ── I2C (stubs) ────────────────────────────────────────────────────────────
esp_err_t i2c_param_config(i2c_port_t port, const i2c_config_t* cfg) {
  (void)port; (void)cfg; return ESP_OK;
}
esp_err_t i2c_driver_install(i2c_port_t port, i2c_mode_t mode,
                              size_t rx, size_t tx, int flags) {
  (void)port; (void)mode; (void)rx; (void)tx; (void)flags; return ESP_OK;
}

// ── stdin injection thread ─────────────────────────────────────────────────
// Reads lines of the form {"t":"gpio_in","pin":N,"val":V}
// and updates gpio_state so the polling tasks see the change.
static void* stdin_reader(void* arg) {
  (void)arg;
  char line[256];
  while (fgets(line, sizeof(line), stdin)) {
    int pin = -1, val = -1;
    if (sscanf(line, "{\"t\":\"gpio_in\",\"pin\":%d,\"val\":%d}", &pin, &val) == 2) {
      if (pin >= 0 && pin < GPIO_MAX) {
        pthread_mutex_lock(&gpio_mutex);
        gpio_state[pin] = val ? 1 : 0;
        pthread_mutex_unlock(&gpio_mutex);
      }
    }
  }
  return NULL;
}

// ── Entry point ────────────────────────────────────────────────────────────
extern void app_main(void);

int main(void) {
  pthread_t t;
  pthread_create(&t, NULL, stdin_reader, NULL);
  pthread_detach(t);

  // Emit ready signal so Electron knows the process is up
  pthread_mutex_lock(&out_mutex);
  printf("{\"t\":\"ready\"}\n");
  fflush(stdout);
  pthread_mutex_unlock(&out_mutex);

  app_main();

  // app_main returns after spawning FreeRTOS tasks (now pthreads).
  // Keep main alive so detached threads can run.
  while (1) sleep(1);
  return 0;
}
