/**
 * Dress name autocomplete — supports any word order (e.g. "golden ct" → "CT Golden").
 */
(function(global) {
  'use strict';

  function dressNameWords(q) {
    return (q || '').toLowerCase().split(/\s+/).filter(function(w) { return w.length > 0; });
  }

  function dressNameMatches(text, query) {
    var textL = (text || '').toLowerCase();
    var words = dressNameWords(query);
    if (!words.length) return true;
    return words.every(function(w) { return textL.indexOf(w) !== -1; });
  }

  function initDressNameSuggest(input, options) {
    if (!input || input._dressSuggestInit) return;
    if (input.getAttribute('data-skip-dress-suggest') === 'true') return;
    input._dressSuggestInit = true;
    options = options || {};

    var wrap = input.parentNode;
    if (!wrap.classList.contains('dress-suggest-wrap')) {
      wrap = document.createElement('div');
      wrap.className = 'dress-suggest-wrap';
      input.parentNode.insertBefore(wrap, input);
      wrap.appendChild(input);
    }

    var dropdown = document.createElement('div');
    dropdown.className = 'dress-suggest-dropdown';
    dropdown.style.display = 'none';
    document.body.appendChild(dropdown);

    window.addEventListener('scroll', function() {
      if (dropdown.style.display !== 'none') positionDropdown();
    }, true);
    window.addEventListener('resize', function() {
      if (dropdown.style.display !== 'none') positionDropdown();
    });

    var timer = null;
    var activeIdx = -1;
    var suppressFetchUntil = 0;

    function getCategory() {
      if (options.getCategory) return options.getCategory() || '';
      if (options.categorySelect) return options.categorySelect.value || '';
      return '';
    }

    function positionDropdown() {
      var rect = input.getBoundingClientRect();
      dropdown.style.position = 'fixed';
      dropdown.style.left = rect.left + 'px';
      dropdown.style.top = (rect.bottom + 4) + 'px';
      dropdown.style.width = rect.width + 'px';
      dropdown.style.right = 'auto';
      dropdown.style.zIndex = '10000';
    }

    function showDropdown() {
      if (!dropdown.parentNode || dropdown.parentNode !== document.body) {
        document.body.appendChild(dropdown);
      }
      positionDropdown();
      dropdown.style.display = 'block';
    }

    function hideDropdown() {
      dropdown.style.display = 'none';
      dropdown.innerHTML = '';
      activeIdx = -1;
    }

    function selectItem(item) {
      clearTimeout(timer);
      suppressFetchUntil = Date.now() + 600;
      input.value = item.name;
      hideDropdown();
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
      if (options.onSelect) options.onSelect(item);
      input.blur();
    }

    function renderItems(items) {
      if (!items.length) {
        hideDropdown();
        return;
      }
      dropdown.innerHTML = items.map(function(item, idx) {
        var meta = [item.category, item.size ? 'Size ' + item.size : '', item.sku].filter(Boolean).join(' · ');
        return '<button type="button" class="dress-suggest-item' + (idx === activeIdx ? ' active' : '') + '" data-idx="' + idx + '">'
          + '<span class="dress-suggest-name">' + escapeHtml(item.display_name || item.name) + '</span>'
          + '<span class="dress-suggest-meta">' + escapeHtml(meta) + '</span>'
          + '</button>';
      }).join('');
      dropdown.style.display = 'block';
      positionDropdown();
      dropdown._items = items;
      dropdown.querySelectorAll('.dress-suggest-item').forEach(function(btn) {
        btn.addEventListener('mousedown', function(e) {
          e.preventDefault();
          var i = parseInt(btn.getAttribute('data-idx'), 10);
          selectItem(items[i]);
        });
      });
    }

    function escapeHtml(t) {
      var d = document.createElement('div');
      d.textContent = t || '';
      return d.innerHTML;
    }

    function fetchSuggestions() {
      if (Date.now() < suppressFetchUntil) return;
      var q = input.value.trim();
      var min = options.minChars != null ? options.minChars : 1;
      if (q.length < min) {
        hideDropdown();
        return;
      }
      var url = '/api/dress-name/suggest?q=' + encodeURIComponent(q)
        + '&category=' + encodeURIComponent(getCategory())
        + '&limit=' + (options.limit || 12);
      fetch(url)
        .then(function(r) { return r.json(); })
        .then(function(items) {
          if (options.clientFilter !== false) {
            items = items.filter(function(it) {
              return dressNameMatches(it.name, q) || dressNameMatches(it.display_name || '', q);
            });
          }
          renderItems(items);
        })
        .catch(function() { hideDropdown(); });
    }

    input.addEventListener('input', function() {
      clearTimeout(timer);
      timer = setTimeout(fetchSuggestions, 280);
    });

    input.addEventListener('focus', function() {
      if (Date.now() < suppressFetchUntil) return;
      if (input.value.trim().length >= (options.minChars != null ? options.minChars : 1)) {
        fetchSuggestions();
      }
    });

    input.addEventListener('keydown', function(e) {
      var items = dropdown._items || [];
      if (!items.length || dropdown.style.display === 'none') return;
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        activeIdx = Math.min(activeIdx + 1, items.length - 1);
        renderItems(items);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        activeIdx = Math.max(activeIdx - 1, 0);
        renderItems(items);
      } else if (e.key === 'Enter' && activeIdx >= 0) {
        e.preventDefault();
        selectItem(items[activeIdx]);
      } else if (e.key === 'Escape') {
        hideDropdown();
      }
    });

    document.addEventListener('click', function(e) {
      if (!wrap.contains(e.target) && !dropdown.contains(e.target)) hideDropdown();
    });

    if (options.categorySelect) {
      options.categorySelect.addEventListener('change', function() {
        if (input.value.trim()) fetchSuggestions();
      });
    }
  }

  function autoInitDressSuggest() {
    document.querySelectorAll('.dress-name-suggest').forEach(function(inp) {
      if (inp.getAttribute('data-skip-dress-suggest') === 'true') return;
      var catSel = inp.dataset.categorySelect
        ? document.querySelector(inp.dataset.categorySelect)
        : null;
      initDressNameSuggest(inp, { categorySelect: catSel });
    });
  }

  global.dressNameMatches = dressNameMatches;
  global.initDressNameSuggest = initDressNameSuggest;
  global.autoInitDressSuggest = autoInitDressSuggest;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', autoInitDressSuggest);
  } else {
    autoInitDressSuggest();
  }
})(window);
