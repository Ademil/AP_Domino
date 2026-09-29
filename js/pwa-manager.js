/* ===================================================================
   AP DOMINÓ — pwa-manager.js
   Registro do Service Worker, detecção de instalação e modo standalone.

   IMPORTANTE: em file:// NÃO fazemos absolutamente nada relacionado a
   Service Worker ou manifest, porque o Chrome trata cada file:// como
   uma origem única e emite avisos "Unsafe attempt to load URL".
   =================================================================== */
(function (global) {
  'use strict';

  const AP = (global.AP = global.AP || {});

  // Uma única decisão, tomada no carregamento do script:
  const IS_HTTP = (global.location.protocol === 'http:' || global.location.protocol === 'https:');

  const PWAManager = {
    deferredPrompt: null,
    onInstallAvailabilityChange: null,
    registration: null,
    isHttp: IS_HTTP,

    init(onInstallAvailabilityChange) {
      this.onInstallAvailabilityChange = onInstallAvailabilityChange || function () {};

      // Em file:// não faz nada — nem escuta beforeinstallprompt, nem registra SW.
      if (!IS_HTTP) return;

      const self = this;

      global.addEventListener('beforeinstallprompt', function (ev) {
        ev.preventDefault();
        self.deferredPrompt = ev;
        self.onInstallAvailabilityChange(true);
      });

      global.addEventListener('appinstalled', function () {
        self.deferredPrompt = null;
        self.onInstallAvailabilityChange(false);
      });

      if ('serviceWorker' in navigator) {
        global.addEventListener('load', function () {
          navigator.serviceWorker.register('./service-worker.js')
            .then(function (reg) { self.registration = reg; })
            .catch(function () { /* offline-first degrada silenciosamente */ });
        });
      }
    },

    canInstall() {
      if (!IS_HTTP) return false;
      return this.deferredPrompt !== null;
    },

    promptInstall() {
      if (!IS_HTTP || !this.deferredPrompt) return Promise.resolve(false);
      const self = this;
      const prompt = this.deferredPrompt;
      this.deferredPrompt = null;
      prompt.prompt();
      return prompt.userChoice.then(function (choice) {
        self.onInstallAvailabilityChange(false);
        return choice && choice.outcome === 'accepted';
      }).catch(function () { return false; });
    },

    isStandalone() {
      if (global.matchMedia && global.matchMedia('(display-mode: standalone)').matches) return true;
      if (global.navigator.standalone === true) return true;
      return false;
    },

    isIOS() {
      const ua = global.navigator.userAgent || '';
      return /iPad|iPhone|iPod/.test(ua) && !global.MSStream;
    }
  };

  AP.PWAManager = PWAManager;

})(window);