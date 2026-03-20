(() => {
  const originalFetch = window.fetch;
  window.fetch = async function (...args) {
    console.log('[hook] fetch args', args);
    const result = await originalFetch.apply(this, args);
    console.log('[hook] fetch response', {
      url: result.url,
      status: result.status,
      type: result.type,
    });
    return result;
  };
})();
