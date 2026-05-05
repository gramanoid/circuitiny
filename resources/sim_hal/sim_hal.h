#pragma once
// Thin ESP-IDF + FreeRTOS stub for host-native simulation.
// Compiled together with the generated app_main.c using the host clang.
// All hardware calls are replaced with POSIX equivalents; GPIO state is
// communicated to the Electron renderer via stdout JSON lines.

#include <stdio.h>
#include <stdlib.h>
#include <stdint.h>
#include <stdarg.h>
#include <string.h>
#include <unistd.h>
#include <pthread.h>
#include <time.h>

// ── esp_err ────────────────────────────────────────────────────────────────
typedef int esp_err_t;
#define ESP_OK    0
#define ESP_FAIL -1
#define ESP_ERROR_CHECK(x) \
  do { esp_err_t _r = (x); \
       if (_r != ESP_OK) { fprintf(stderr, "ESP_ERROR_CHECK failed: %d\n", _r); exit(1); } \
  } while(0)

// ── FreeRTOS ───────────────────────────────────────────────────────────────
typedef uint32_t  TickType_t;
typedef void*     TaskHandle_t;
typedef int       BaseType_t;
typedef void (*TaskFunction_t)(void*);

// CONFIG_FREERTOS_HZ=1000 → 1 tick == 1 ms
#define pdMS_TO_TICKS(ms)   ((TickType_t)(ms))
#define pdTRUE               1
#define pdFALSE              0
#define portMAX_DELAY        UINT32_MAX

BaseType_t   xTaskCreate(TaskFunction_t fn, const char* name, uint32_t stack,
                         void* arg, int prio, TaskHandle_t* out);
void         vTaskDelay(TickType_t ticks);
void         vTaskDelayUntil(TickType_t* prev, TickType_t inc);
TickType_t   xTaskGetTickCount(void);

// ── GPIO ───────────────────────────────────────────────────────────────────
typedef int gpio_num_t;
typedef enum {
  GPIO_MODE_DISABLE        = 0,
  GPIO_MODE_INPUT          = 1,
  GPIO_MODE_OUTPUT         = 2,
  GPIO_MODE_OUTPUT_OD      = 3,
  GPIO_MODE_INPUT_OUTPUT   = 4,
} gpio_mode_t;
typedef enum {
  GPIO_PULLUP_ONLY     = 0,
  GPIO_PULLDOWN_ONLY   = 1,
  GPIO_PULLUP_PULLDOWN = 2,
  GPIO_FLOATING        = 3,
} gpio_pull_mode_t;

#define GPIO_PULLUP_ENABLE    1
#define GPIO_PULLDOWN_ENABLE  1

esp_err_t gpio_reset_pin(gpio_num_t pin);
esp_err_t gpio_set_direction(gpio_num_t pin, gpio_mode_t mode);
esp_err_t gpio_set_level(gpio_num_t pin, uint32_t level);
int       gpio_get_level(gpio_num_t pin);
esp_err_t gpio_set_pull_mode(gpio_num_t pin, gpio_pull_mode_t mode);

// ── Logging ────────────────────────────────────────────────────────────────
void sim_log(char level, const char* tag, const char* fmt, ...);
#define ESP_LOGI(tag, fmt, ...) sim_log('I', tag, fmt, ##__VA_ARGS__)
#define ESP_LOGW(tag, fmt, ...) sim_log('W', tag, fmt, ##__VA_ARGS__)
#define ESP_LOGE(tag, fmt, ...) sim_log('E', tag, fmt, ##__VA_ARGS__)
#define ESP_LOGD(tag, fmt, ...) sim_log('D', tag, fmt, ##__VA_ARGS__)
#define ESP_LOGV(tag, fmt, ...) ((void)0)

// ── NVS (stub) ─────────────────────────────────────────────────────────────
esp_err_t nvs_flash_init(void);

// ── I2C (stub) ─────────────────────────────────────────────────────────────
typedef enum { I2C_MODE_MASTER = 0, I2C_MODE_SLAVE = 1 } i2c_mode_t;
typedef int i2c_port_t;
#define I2C_NUM_0 0
#define I2C_NUM_1 1

typedef struct {
  i2c_mode_t mode;
  int        sda_io_num;
  int        scl_io_num;
  int        sda_pullup_en;
  int        scl_pullup_en;
  struct { int clk_speed; } master;
} i2c_config_t;

esp_err_t i2c_param_config(i2c_port_t port, const i2c_config_t* cfg);
esp_err_t i2c_driver_install(i2c_port_t port, i2c_mode_t mode,
                              size_t rx_buf, size_t tx_buf, int flags);
