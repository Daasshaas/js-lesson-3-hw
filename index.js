const gallery = document.getElementById('gallery');
const modeToggle = document.getElementById('modeToggle');
const modeLabel = document.getElementById('modeLabel');
const loadAllBtn = document.getElementById('loadAllBtn');
const disconnectObserverBtn = document.getElementById('disconnectObserverBtn');

let io = null; // IntersectionObserver instance
let currentMode = 'scroll'; // 'scroll' | 'click'

/**
 * Допоміжна: копіює data-* атрибути у реальні атрибути <img> / <source>
 */
function applyDataAttributes(img) {
  // <picture> може містити <source> з data-srcset — переносимо йому теж
  const picture = img.closest('picture');
  if (picture) {
    const sources = picture.querySelectorAll('source[data-srcset]');
    sources.forEach((source) => {
      source.srcset = source.dataset.srcset;
      // Після застосування — можна (не обов’язково) чистити data-атрибут:
      // delete source.dataset.srcset;
    });
  }

  // Для <img>: переносимо data-src, data-srcset, data-sizes у відповідні атрибути
  if (img.dataset.src) {
    img.src = img.dataset.src;
  }
  if (img.dataset.srcset) {
    img.srcset = img.dataset.srcset;
  }
  if (img.dataset.sizes) {
    img.sizes = img.dataset.sizes;
  }
}

/**
 * Основне завантаження одного зображення.
 * Повертає Promise, який резолвиться, коли браузер реально завантажив файл.
 */
function loadImage(img) {
  return new Promise((resolve, reject) => {
    // Якщо вже завантажено — нічого не робимо
    if (img.classList.contains('loaded')) {
      resolve();
      return;
    }

    // Навішуємо обробники до зміни src/srcset
    const onLoad = () => {
      img.classList.add('loaded');
      const skeletonWrap = img.closest('.skeleton');
      skeletonWrap?.classList.add('loaded');
      cleanup();
      resolve();
    };
    const onError = (e) => {
      // Можна підставити запасну картинку або показати повідомлення
      console.warn('Помилка завантаження зображення:', e?.message || e);
      cleanup();
      reject(e);
    };
    const cleanup = () => {
      img.removeEventListener('load', onLoad);
      img.removeEventListener('error', onError);
    };

    img.addEventListener('load', onLoad, { once: true });
    img.addEventListener('error', onError, { once: true });

    // Переносимо data-* у реальні атрибути (це запустить завантаження)
    applyDataAttributes(img);
  });
}

/**
 * Створює або перевідкриває IntersectionObserver для "scroll"-режиму
 */
function ensureObserver() {
  if (io) return io;

  // Базові налаштування: починаємо завантаження, коли 20% елемента у в’юпорті.
  io = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;

      const img = entry.target;
      // Безпека: спостерігати має сенс тільки ті, що у режимі "scroll"
      const loadMode = img.dataset.load || 'scroll';
      if (loadMode !== 'scroll') return;

      // Завантажуємо та більше не спостерігаємо цей елемент
      loadImage(img).catch(() => {});
      io.unobserve(img);
    });
  }, {
    root: null,
    rootMargin: '200px 0px', // невеликий "зазор" для передзавантаження
    threshold: 0.2,
  });

  return io;
}

/**
 * Підготувати всі <img.lazy> відповідно до їхнього режиму
 */
function setupImages() {
  const images = gallery.querySelectorAll('img.lazy');

  images.forEach((img) => {
    const loadMode = img.dataset.load || 'scroll';

    // Якщо режим "click" — показуємо кнопку у картці
    const card = img.closest('.card');
    const btn = card?.querySelector('.load-now');

    if (loadMode === 'click') {
      btn?.removeAttribute('hidden');
      btn?.addEventListener('click', async () => {
        btn.disabled = true;
        btn.textContent = 'Завантаження…';
        try {
          await loadImage(img);
          btn.textContent = 'Готово';
        } catch {
          btn.textContent = 'Помилка, спробуйте ще';
          btn.disabled = false;
        }
      });
    } else {
      // Режим "scroll": ховаємо кнопку, якщо вона є, і під’єднуємо IO
      btn?.setAttribute('hidden', '');
      ensureObserver().observe(img);
    }
  });
}

/**
 * Перемикання глобального режиму:
 * - коли активовано "авто (on-scroll)" — усі img отримують data-load="scroll"
 * - коли вимкнено — усі img отримують data-load="click"
 */
function toggleMode(isScroll) {
  currentMode = isScroll ? 'scroll' : 'click';
  modeLabel.textContent = isScroll ? 'авто (on-scroll)' : 'по кліку (on-click)';

  const images = gallery.querySelectorAll('img.lazy');
  images.forEach((img) => {
    img.dataset.load = currentMode;

    // Скидаємо стан для демонстрації: прибрати loaded, щоб побачити ефект ще раз
    // У реальному проекті зазвичай не скидають вже завантажені.
    if (img.classList.contains('loaded')) return;

    // Оновлюємо видимість кнопок та спостерігач
    const card = img.closest('.card');
    const btn = card?.querySelector('.load-now');

    if (currentMode === 'scroll') {
      btn?.setAttribute('hidden', '');
      ensureObserver().observe(img);
    } else {
      btn?.removeAttribute('hidden');
      if (io) io.unobserve(img);
    }
  });
}

/**
 * Ручне завантаження всіх ще не завантажених зображень
 */
async function loadAll() {
  const images = Array.from(gallery.querySelectorAll('img.lazy:not(.loaded)'));
  await Promise.allSettled(images.map(loadImage));
}

/**
 * Ініціалізація
 */
function init() {
  setupImages();

  // Перемикач режиму
  modeToggle.addEventListener('change', (e) => {
    const isScroll = e.target.checked;
    toggleMode(isScroll);
  });

  // Кнопка: завантажити все зараз
  loadAllBtn.addEventListener('click', () => {
    loadAll();
  });

  // Кнопка: зупинити IntersectionObserver (для тестів у DevTools)
  disconnectObserverBtn.addEventListener('click', () => {
    if (io) {
      io.disconnect();
      io = null;
      console.log('IntersectionObserver відключено');
    }
  });
}

init();
