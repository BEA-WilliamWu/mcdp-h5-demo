<script setup>
import { computed, onMounted, ref } from 'vue'

const OSS_BASE = '/bcm/'
const OSS_ENTRY = '/bcm/index.html'
const API_ORIGIN = 'https://c86e660649a94346bb9d00a9e621da5d-cn-hongkong.alicloudapi.com'
const LOCAL_API_PREFIX = '/api-gateway'

const frameHtml = ref('')
const loading = ref(false)
const error = ref('')
const loadedAt = ref(null)

const statusText = computed(() => {
  if (loading.value) return '加载中'
  if (error.value) return '加载失败'
  if (frameHtml.value) return '已加载'
  return '待加载'
})

function makeRuntimePatch () {
  return `
<script>
(function () {
  var API_ORIGIN = ${JSON.stringify(API_ORIGIN)};
  var LOCAL_API_PREFIX = ${JSON.stringify(LOCAL_API_PREFIX)};

  function rewriteUrl(url) {
    if (!url) return url;
    if (typeof url === 'string') {
      if (url.indexOf(API_ORIGIN) === 0) {
        return LOCAL_API_PREFIX + url.slice(API_ORIGIN.length);
      }
      return url;
    }
    try {
      var parsed = new URL(url.url || String(url), window.location.href);
      if (parsed.origin === API_ORIGIN) {
        return LOCAL_API_PREFIX + parsed.pathname + parsed.search + parsed.hash;
      }
    } catch (err) {}
    return url;
  }

  var nativeOpen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function (method, url) {
    arguments[1] = rewriteUrl(url);
    return nativeOpen.apply(this, arguments);
  };

  if (window.fetch) {
    var nativeFetch = window.fetch;
    window.fetch = function (input, init) {
      if (input instanceof Request) {
        var rewritten = rewriteUrl(input.url);
        if (rewritten !== input.url) {
          input = new Request(rewritten, input);
        }
      } else {
        input = rewriteUrl(input);
      }
      return nativeFetch.call(this, input, init);
    };
  }
})();
<\/script>`
}

function transformHtml (html) {
  const cleaned = html.replace(/<base\\b[^>]*>/gi, '')
  const injected = `<base href="${OSS_BASE}">\n${makeRuntimePatch()}`

  if (/<head\\b[^>]*>/i.test(cleaned)) {
    return cleaned.replace(/<head(\\s[^>]*)?>/i, match => `${match}\n${injected}`)
  }

  return `${injected}\n${cleaned}`
}

async function loadRemoteApp () {
  loading.value = true
  error.value = ''

  try {
    const response = await fetch(`${OSS_ENTRY}?shell_ts=${Date.now()}`, {
      cache: 'no-store'
    })

    if (!response.ok) {
      throw new Error(`OSS 返回 ${response.status}`)
    }

    const html = await response.text()
    frameHtml.value = transformHtml(html)
    loadedAt.value = new Date()
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err)
  } finally {
    loading.value = false
  }
}

onMounted(loadRemoteApp)
</script>

<template>
  <main class="shell">
    <header class="toolbar">
      <div>
        <h1>BCM CMS</h1>
        <p>{{ statusText }}<span v-if="loadedAt"> · {{ loadedAt.toLocaleTimeString() }}</span></p>
      </div>
      <button type="button" :disabled="loading" @click="loadRemoteApp">
        {{ loading ? '加载中' : '重新加载' }}
      </button>
    </header>

    <section v-if="error" class="error">
      <strong>{{ error }}</strong>
    </section>

    <iframe
      v-if="frameHtml"
      class="frame"
      title="BCM CMS"
      :srcdoc="frameHtml"
    />
  </main>
</template>
