// ==UserScript==
// @name         Colinhas do Keep (.zip Google Takeout + Preview + Copiar)
// @namespace    http://tampermonkey.net/
// @version      2.4
// @description  Sugestões de colinhas do Keep com upload direto do .zip, preview do conteúdo e cópia automática para a área de transferência com ícone flutuante arrastável
// @author       Thiago
// @match        *://*/*
// @grant        none
// @require      https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js
// ==/UserScript==

(function () {
  'use strict';

  let colinhas = [];
  let managementPanel = null;
  let suggestionBox = null;
  let floatingIcon = null;
  let searchInput = null;
  let isDragging = false;
  let dragStartX = 0;
  let dragStartY = 0;
  let iconStartX = 0;
  let iconStartY = 0;

  // Tema dark fixo
  const theme = {
    background: '#2d2d2d',
    panelBackground: '#1e1e1e',
    textColor: '#ffffff',
    borderColor: '#404040',
    hoverBackground: '#404040',
    secondaryText: '#b0b0b0',
    inputBackground: '#404040',
    inputTextColor: '#ffffff',
    successBackground: '#1e3a1e',
    successColor: '#90ee90',
    warningBackground: '#3d3d1e',
    warningColor: '#ffeb3b',
    errorBackground: '#3d1e1e',
    errorColor: '#ff6b6b',
    infoBackground: '#2a2a2a',
    infoTextColor: '#ffffff',
    iconBackground: 'rgba(30,30,30,0.95)',
    highlightBackground: '#ffeb3b',
    highlightColor: '#000000',
    floatingIconBg: 'rgba(30,30,30,0.9)',
    floatingIconHover: 'rgba(45,45,45,0.95)'
  };

  const loadColinhas = () => {
    const data = localStorage.getItem('colinhasKeep');
    if (data) {
      try {
        colinhas = JSON.parse(data);
      } catch (e) {
        console.error("Erro ao carregar colinhas:", e);
      }
    }
  };

  const saveColinhas = (newColinhas) => {
    localStorage.setItem('colinhasKeep', JSON.stringify(newColinhas));
    colinhas = newColinhas;
  };

  const clearColinhas = () => {
    localStorage.removeItem('colinhasKeep');
    colinhas = [];
  };

  // Salvar e carregar posição do ícone
  const saveIconPosition = (x, y) => {
    localStorage.setItem('colinhasKeepIconPosition', JSON.stringify({ x, y }));
  };

  const loadIconPosition = () => {
    const data = localStorage.getItem('colinhasKeepIconPosition');
    if (data) {
      try {
        return JSON.parse(data);
      } catch (e) {
        console.error("Erro ao carregar posição do ícone:", e);
      }
    }
    return { x: 20, y: 20 }; // Posição padrão
  };

  // Função para destacar texto que combina com a busca
  const highlightText = (text, searchTerm) => {
    if (!searchTerm || !text) return text;

    const regex = new RegExp(`(${searchTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
    return text.replace(regex, `<mark style="background-color: ${theme.highlightBackground}; color: ${theme.highlightColor}; padding: 1px 2px; border-radius: 2px;">$1</mark>`);
  };

  const createFloatingIcon = () => {
    const savedPosition = loadIconPosition();

    const icon = document.createElement('div');
    icon.innerHTML = '📋';
    icon.title = 'Colinhas do Keep (Arraste para mover)';
    icon.style.cssText = `
      position: fixed;
      top: ${savedPosition.y}px;
      right: ${savedPosition.x}px;
      width: 40px;
      height: 40px;
      background: ${theme.floatingIconBg};
      color: ${theme.textColor};
      border: 2px solid ${theme.borderColor};
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: grab;
      z-index: 999999;
      font-size: 18px;
      transition: all 0.3s ease;
      box-shadow: 0 2px 10px rgba(0,0,0,0.3);
      backdrop-filter: blur(5px);
      user-select: none;
    `;

    // Eventos de mouse para arrastar
    icon.onmousedown = (e) => {
      e.preventDefault();
      isDragging = true;
      dragStartX = e.clientX;
      dragStartY = e.clientY;

      const rect = icon.getBoundingClientRect();
      iconStartX = window.innerWidth - rect.right;
      iconStartY = rect.top;

      icon.style.cursor = 'grabbing';
      icon.style.transition = 'none';
      document.body.style.userSelect = 'none';
    };

    const handleMouseMove = (e) => {
      if (!isDragging) return;

      e.preventDefault();
      const deltaX = e.clientX - dragStartX;
      const deltaY = e.clientY - dragStartY;

      let newX = iconStartX - deltaX;
      let newY = iconStartY + deltaY;

      // Limitar dentro da tela
      newX = Math.max(10, Math.min(window.innerWidth - 50, newX));
      newY = Math.max(10, Math.min(window.innerHeight - 50, newY));

      icon.style.right = newX + 'px';
      icon.style.top = newY + 'px';
    };

    const handleMouseUp = (e) => {
      if (!isDragging) return;

      isDragging = false;
      icon.style.cursor = 'grab';
      icon.style.transition = 'all 0.3s ease';
      document.body.style.userSelect = '';

      // Salvar nova posição
      const rect = icon.getBoundingClientRect();
      const newX = window.innerWidth - rect.right;
      const newY = rect.top;
      saveIconPosition(newX, newY);

      // Se foi um clique simples (não arrastou muito), abrir o painel
      const deltaX = Math.abs(e.clientX - dragStartX);
      const deltaY = Math.abs(e.clientY - dragStartY);

      if (deltaX < 5 && deltaY < 5) {
        setTimeout(() => toggleSuggestionBox(), 10);
      }
    };

    // Adicionar listeners ao document
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    // Eventos de hover
    icon.onmouseover = () => {
      if (!isDragging) {
        icon.style.background = theme.floatingIconHover;
        icon.style.transform = 'scale(1.1)';
      }
    };

    icon.onmouseout = () => {
      if (!isDragging) {
        icon.style.background = theme.floatingIconBg;
        icon.style.transform = 'scale(1)';
      }
    };

    // Suporte para touch (dispositivos móveis)
    icon.ontouchstart = (e) => {
      e.preventDefault();
      const touch = e.touches[0];
      isDragging = true;
      dragStartX = touch.clientX;
      dragStartY = touch.clientY;

      const rect = icon.getBoundingClientRect();
      iconStartX = window.innerWidth - rect.right;
      iconStartY = rect.top;

      icon.style.cursor = 'grabbing';
      icon.style.transition = 'none';
    };

    const handleTouchMove = (e) => {
      if (!isDragging) return;

      e.preventDefault();
      const touch = e.touches[0];
      const deltaX = touch.clientX - dragStartX;
      const deltaY = touch.clientY - dragStartY;

      let newX = iconStartX - deltaX;
      let newY = iconStartY + deltaY;

      // Limitar dentro da tela
      newX = Math.max(10, Math.min(window.innerWidth - 50, newX));
      newY = Math.max(10, Math.min(window.innerHeight - 50, newY));

      icon.style.right = newX + 'px';
      icon.style.top = newY + 'px';
    };

    const handleTouchEnd = (e) => {
      if (!isDragging) return;

      isDragging = false;
      icon.style.cursor = 'grab';
      icon.style.transition = 'all 0.3s ease';

      // Salvar nova posição
      const rect = icon.getBoundingClientRect();
      const newX = window.innerWidth - rect.right;
      const newY = rect.top;
      saveIconPosition(newX, newY);

      // Se foi um tap simples, abrir o painel
      const touch = e.changedTouches[0];
      const deltaX = Math.abs(touch.clientX - dragStartX);
      const deltaY = Math.abs(touch.clientY - dragStartY);

      if (deltaX < 5 && deltaY < 5) {
        setTimeout(() => toggleSuggestionBox(), 10);
      }
    };

    document.addEventListener('touchmove', handleTouchMove, { passive: false });
    document.addEventListener('touchend', handleTouchEnd);

    document.body.appendChild(icon);
    floatingIcon = icon;
    return icon;
  };

  const createSearchInput = () => {
    const input = document.createElement('input');
    input.type = 'text';
    input.placeholder = 'Digite para buscar colinhas...';
    input.style.cssText = `
      width: 100%;
      padding: 12px;
      background: ${theme.inputBackground};
      color: ${theme.inputTextColor};
      border: 1px solid ${theme.borderColor};
      border-radius: 8px;
      font-size: 14px;
      outline: none;
      margin-bottom: 10px;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    `;

    input.onfocus = () => {
      input.style.borderColor = '#007bff';
    };

    input.onblur = () => {
      input.style.borderColor = theme.borderColor;
    };

    input.oninput = (e) => {
      showSuggestions(e.target.value);
    };

    searchInput = input;
    return input;
  };

  const createManagementPanel = () => {
    const panel = document.createElement('div');
    panel.style.cssText = `
      position: absolute;
      background: ${theme.panelBackground};
      color: ${theme.textColor};
      border: 2px solid ${theme.borderColor};
      border-radius: 10px;
      box-shadow: 0 4px 20px rgba(0,0,0,0.15);
      padding: 16px;
      z-index: 10001;
      display: none;
      width: 350px;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    `;

    const title = document.createElement('div');
    title.textContent = '📥 Gerenciar Colinhas do Keep';
    title.style.cssText = `
      margin-bottom: 12px;
      font-size: 16px;
      font-weight: bold;
      color: ${theme.textColor};
      text-align: center;
    `;

    const counter = document.createElement('div');
    counter.style.cssText = `
      text-align: center;
      margin-bottom: 12px;
      font-size: 14px;
      color: ${theme.secondaryText};
    `;
    counter.textContent = `${colinhas.length} colinhas carregadas`;

    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = '.zip';
    fileInput.style.cssText = `
      width: 100%;
      padding: 8px;
      border: 1px solid ${theme.borderColor};
      border-radius: 5px;
      background: ${theme.inputBackground};
      color: ${theme.inputTextColor};
      margin-bottom: 10px;
    `;

    const buttonContainer = document.createElement('div');
    buttonContainer.style.cssText = `
      display: flex;
      gap: 8px;
      margin-bottom: 10px;
    `;

    const updateBtn = document.createElement('button');
    updateBtn.textContent = '🔄 Atualizar';
    updateBtn.style.cssText = `
      flex: 1;
      padding: 8px 12px;
      background: #007bff;
      color: white;
      border: none;
      border-radius: 5px;
      cursor: pointer;
      font-size: 13px;
      transition: background 0.2s;
    `;
    updateBtn.onmouseover = () => updateBtn.style.background = '#0056b3';
    updateBtn.onmouseout = () => updateBtn.style.background = '#007bff';

    const clearBtn = document.createElement('button');
    clearBtn.textContent = '🗑️ Limpar';
    clearBtn.style.cssText = `
      flex: 1;
      padding: 8px 12px;
      background: #dc3545;
      color: white;
      border: none;
      border-radius: 5px;
      cursor: pointer;
      font-size: 13px;
      transition: background 0.2s;
    `;
    clearBtn.onmouseover = () => clearBtn.style.background = '#c82333';
    clearBtn.onmouseout = () => clearBtn.style.background = '#dc3545';

    const status = document.createElement('div');
    status.style.cssText = `
      margin-top: 10px;
      font-size: 13px;
      color: ${theme.infoTextColor};
      text-align: center;
      padding: 8px;
      border-radius: 5px;
      background: ${theme.infoBackground};
    `;

    const processZip = async (file, isUpdate = false) => {
      status.textContent = '⏳ Processando arquivo...';
      status.style.background = theme.warningBackground;
      status.style.color = theme.warningColor;

      try {
        const zip = await JSZip.loadAsync(file);
        const keepFiles = Object.keys(zip.files).filter(name =>
          name.startsWith("Takeout/Keep/") && name.endsWith(".json")
        );

        const result = [];

        for (const name of keepFiles) {
          try {
            const content = await zip.files[name].async("string");
            const note = JSON.parse(content);
            const title = (note.title || 'Sem título').trim();
            const text = (note.textContent || '').trim();
            if (title && text) result.push({ title, content: text });
          } catch (err) {
            console.warn(`Erro ao processar ${name}`, err);
          }
        }

        if (result.length > 0) {
          if (isUpdate) {
            const existingTitles = new Set(colinhas.map(c => c.title));
            const newItems = result.filter(item => !existingTitles.has(item.title));
            const updatedColinhas = [...colinhas, ...newItems];
            saveColinhas(updatedColinhas);
            status.textContent = `✅ ${newItems.length} novas colinhas adicionadas (${updatedColinhas.length} total)`;
          } else {
            saveColinhas(result);
            status.textContent = `✅ ${result.length} colinhas carregadas com sucesso`;
          }
          status.style.background = theme.successBackground;
          status.style.color = theme.successColor;
          counter.textContent = `${colinhas.length} colinhas carregadas`;
        } else {
          status.textContent = '⚠️ Nenhuma colinha encontrada no arquivo';
          status.style.background = theme.warningBackground;
          status.style.color = theme.warningColor;
        }
      } catch (err) {
        console.error("Erro ao processar arquivo:", err);
        status.textContent = '❌ Erro ao processar arquivo';
        status.style.background = theme.errorBackground;
        status.style.color = theme.errorColor;
      }
    };

    fileInput.onchange = async (e) => {
      const file = e.target.files[0];
      if (file) {
        await processZip(file, false);
        fileInput.value = '';
      }
    };

    updateBtn.onclick = () => {
      fileInput.click();
      fileInput.onchange = async (e) => {
        const file = e.target.files[0];
        if (file) {
          await processZip(file, true);
          fileInput.value = '';
        }
      };
    };

    clearBtn.onclick = () => {
      if (confirm('Tem certeza que deseja limpar todas as colinhas?')) {
        clearColinhas();
        counter.textContent = '0 colinhas carregadas';
        status.textContent = '🗑️ Colinhas removidas';
        status.style.background = theme.errorBackground;
        status.style.color = theme.errorColor;
      }
    };

    buttonContainer.appendChild(updateBtn);
    buttonContainer.appendChild(clearBtn);

    panel.appendChild(title);
    panel.appendChild(counter);
    panel.appendChild(fileInput);
    panel.appendChild(buttonContainer);
    panel.appendChild(status);

    document.body.appendChild(panel);
    managementPanel = panel;
    return panel;
  };

  const createSuggestionBox = () => {
    const box = document.createElement('div');
    box.id = 'sugestao-colinha';
    box.style.cssText = `
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      z-index: 10000;
      background: ${theme.background};
      color: ${theme.textColor};
      border: 2px solid ${theme.borderColor};
      box-shadow: 0 4px 20px rgba(0,0,0,0.15);
      display: none;
      width: 600px;
      max-width: 90vw;
      max-height: 80vh;
      overflow: hidden;
      font-size: 14px;
      padding: 20px;
      border-radius: 12px;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      backdrop-filter: blur(10px);
    `;

    const header = document.createElement('div');
    header.style.cssText = `
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 15px;
    `;

    const title = document.createElement('div');
    title.textContent = '📋 Colinhas do Keep';
    title.style.cssText = `
      font-size: 16px;
      font-weight: bold;
      color: ${theme.textColor};
    `;

    const closeBtn = document.createElement('button');
    closeBtn.innerHTML = '✕';
    closeBtn.style.cssText = `
      background: none;
      border: none;
      color: ${theme.textColor};
      font-size: 18px;
      cursor: pointer;
      padding: 5px;
      border-radius: 3px;
      opacity: 0.7;
      transition: opacity 0.2s;
    `;
    closeBtn.onmouseover = () => closeBtn.style.opacity = '1';
    closeBtn.onmouseout = () => closeBtn.style.opacity = '0.7';
    closeBtn.onclick = () => closeSuggestionBox();

    const managementIcon = document.createElement('div');
    managementIcon.innerHTML = '⚙️';
    managementIcon.title = 'Gerenciar colinhas';
    managementIcon.style.cssText = `
      font-size: 16px;
      cursor: pointer;
      opacity: 0.7;
      transition: opacity 0.2s;
      padding: 5px;
      border-radius: 3px;
      margin-right: 10px;
    `;
    managementIcon.onmouseover = () => managementIcon.style.opacity = '1';
    managementIcon.onmouseout = () => managementIcon.style.opacity = '0.7';
    managementIcon.onclick = (e) => {
      e.stopPropagation();
      toggleManagementPanel();
    };

    const headerRight = document.createElement('div');
    headerRight.style.display = 'flex';
    headerRight.style.alignItems = 'center';
    headerRight.appendChild(managementIcon);
    headerRight.appendChild(closeBtn);

    header.appendChild(title);
    header.appendChild(headerRight);

    const searchContainer = createSearchInput();

    const resultsContainer = document.createElement('div');
    resultsContainer.id = 'results-container';
    resultsContainer.style.cssText = `
      max-height: calc(80vh - 130px);
      overflow-y: auto;
      overflow-x: hidden;
      scrollbar-width: thin;
      scrollbar-color: ${theme.borderColor} transparent;
    `;

    const style = document.createElement('style');
    style.textContent = `
      #results-container::-webkit-scrollbar {
        width: 8px;
      }
      #results-container::-webkit-scrollbar-track {
        background: transparent;
      }
      #results-container::-webkit-scrollbar-thumb {
        background: ${theme.borderColor};
        border-radius: 4px;
      }
      #results-container::-webkit-scrollbar-thumb:hover {
        background: ${theme.hoverBackground};
      }
    `;
    document.head.appendChild(style);

    box.appendChild(header);
    box.appendChild(searchContainer);
    box.appendChild(resultsContainer);

    document.body.appendChild(box);
    suggestionBox = box;
    return box;
  };

  const createNoColinhasMessage = () => {
    const container = document.createElement('div');
    container.style.cssText = `
      padding: 20px;
      text-align: center;
      color: ${theme.textColor};
      font-size: 14px;
    `;

    const message = document.createElement('div');
    message.textContent = 'Nenhuma colinha encontrada';
    message.style.cssText = `
      margin-bottom: 8px;
      font-style: italic;
      color: ${theme.textColor};
    `;

    const hint = document.createElement('div');
    hint.textContent = 'Clique no ícone ⚙️ para carregar suas colinhas';
    hint.style.cssText = `
      font-size: 12px;
      color: ${theme.secondaryText};
    `;

    container.appendChild(message);
    container.appendChild(hint);
    return container;
  };

  const showSuggestions = (value) => {
    const resultsContainer = document.getElementById('results-container');
    resultsContainer.innerHTML = '';

    if (!value || value.length < 1) {
      if (colinhas.length === 0) {
        resultsContainer.appendChild(createNoColinhasMessage());
      } else {
        // Mostrar todas as colinhas se não há filtro
        const allItems = colinhas.slice(0, 20); // Limitar a 20 itens
        allItems.forEach(item => {
          resultsContainer.appendChild(createSuggestionItem(item, ''));
        });
      }
      return;
    }

    // Filtrar colinhas APENAS pelo título
    const filtered = colinhas.filter(c =>
      c.title.toLowerCase().includes(value.toLowerCase())
    ).slice(0, 15);

    if (filtered.length === 0) {
      const noResults = document.createElement('div');
      noResults.textContent = 'Nenhuma colinha encontrada para esta busca';
      noResults.style.cssText = `
        padding: 20px;
        text-align: center;
        color: ${theme.textColor};
        font-size: 14px;
        font-style: italic;
      `;
      resultsContainer.appendChild(noResults);
    } else {
      filtered.forEach(item => {
        resultsContainer.appendChild(createSuggestionItem(item, value));
      });
    }
  };

  const createSuggestionItem = (item, searchValue) => {
    const div = document.createElement('div');
    div.style.cssText = `
      padding: 12px;
      cursor: pointer;
      border-bottom: 1px solid ${theme.borderColor};
      transition: background 0.2s;
      color: ${theme.textColor};
      border-radius: 6px;
      margin-bottom: 5px;
      overflow-wrap: break-word;
      word-break: break-word;
      max-width: 100%;
    `;

    const titulo = document.createElement('div');
    titulo.innerHTML = highlightText(item.title, searchValue);
    titulo.style.cssText = `
      font-weight: 600;
      margin-bottom: 6px;
      color: ${theme.textColor};
      overflow-wrap: break-word;
      word-break: break-word;
    `;

    const preview = document.createElement('div');
    const previewText = item.content.length > 150 ? item.content.slice(0, 147) + '...' : item.content;
    preview.innerHTML = highlightText(previewText, searchValue);
    preview.style.cssText = `
      font-size: 13px;
      color: ${theme.secondaryText};
      line-height: 1.4;
      overflow-wrap: break-word;
      word-break: break-word;
    `;
    div.appendChild(titulo);
    div.appendChild(preview);

    div.onmouseover = () => div.style.background = theme.hoverBackground;
    div.onmouseout = () => div.style.background = 'transparent';

    div.onclick = async () => {
      try {
        await navigator.clipboard.writeText(item.content);
        closeSuggestionBox(); // Fecha imediatamente após copiar

        // Limpa busca (opcional, mas útil para o próximo uso)
        if (searchInput) {
          searchInput.value = '';
          showSuggestions('');
        }
      } catch (err) {
        console.error('Erro ao copiar:', err);
        div.style.background = theme.errorBackground;
        div.style.color = theme.errorColor;

        setTimeout(() => {
          div.style.background = 'transparent';
          div.style.color = theme.textColor;
        }, 1000);
      }
    };

    return div;
  };

  const toggleSuggestionBox = () => {
  if (suggestionBox.style.display === 'none' || suggestionBox.style.display === '') {
    suggestionBox.style.display = 'block';
    floatingIcon.style.display = 'none'; // Oculta o ícone quando abre a interface
    showSuggestions('');
    if (searchInput) {
      setTimeout(() => searchInput.focus(), 100);
    }
  } else {
    closeSuggestionBox();
  }
};


  const closeSuggestionBox = () => {
  suggestionBox.style.display = 'none';
  managementPanel.style.display = 'none';
  floatingIcon.style.display = 'flex'; // Mostra o ícone novamente quando fecha a interface
};

  const toggleManagementPanel = () => {
    const isVisible = managementPanel.style.display === 'block';
    if (isVisible) {
      managementPanel.style.display = 'none';
    } else {
      // Posicionar o painel próximo ao centro
      managementPanel.style.top = '50%';
      managementPanel.style.left = '50%';
      managementPanel.style.transform = 'translate(-50%, -50%)';
      managementPanel.style.position = 'fixed';
      managementPanel.style.display = 'block';
    }
  };

  const setupEventListeners = () => {
    // Fechar ao clicar fora
    document.addEventListener('click', (e) => {
      if (!suggestionBox.contains(e.target) &&
          !managementPanel.contains(e.target) &&
          !floatingIcon.contains(e.target)) {
        closeSuggestionBox();
      }
    });

    // Tecla ESC para fechar
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        closeSuggestionBox();
      }
    });

    // Reposicionar ícone quando a janela for redimensionada
    window.addEventListener('resize', () => {
      if (floatingIcon) {
        const rect = floatingIcon.getBoundingClientRect();
        let newX = Math.max(10, Math.min(window.innerWidth - 50, window.innerWidth - rect.right));
        let newY = Math.max(10, Math.min(window.innerHeight - 50, rect.top));

        floatingIcon.style.right = newX + 'px';
        floatingIcon.style.top = newY + 'px';

        saveIconPosition(newX, newY);
      }
    });
  };

  const init = () => {
    loadColinhas();
    createFloatingIcon();
    createSuggestionBox();
    createManagementPanel();
    setupEventListeners();
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
