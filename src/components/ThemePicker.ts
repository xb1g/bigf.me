
export function createThemePicker(): HTMLElement {
  const container = document.createElement('div');
  container.className = 'theme-picker mb-6 bg-[#15151f] border border-[#2a2a3f] rounded-lg p-6 shadow-xl';
  
  const title = document.createElement('h2');
  title.className = 'text-[#39ff14] font-bold text-lg mb-4 flex items-center gap-2';
  title.innerHTML = '<span>🎨</span> Theme Customizer';
  container.appendChild(title);
  
  const description = document.createElement('p');
  description.className = 'text-xs text-[#6b7280] mb-6';
  description.textContent = 'Adjust the colors below. Changes are applied instantly. Click "Copy Theme" to get your settings.';
  container.appendChild(description);
  
  const colors = [
    { label: 'Background', var: '--color-terminal-bg', default: '#0a0a0f' },
    { label: 'Text', var: '--color-terminal-text', default: '#e2e8f0' },
    { label: 'Prompt', var: '--color-terminal-prompt', default: '#ff6b9d' },
    { label: 'Link', var: '--color-terminal-link', default: '#00d4ff' },
    { label: 'Success', var: '--color-terminal-success', default: '#39ff14' },
    { label: 'Synth Pink', var: '--color-synth-pink', default: '#ff6b9d' },
    { label: 'Synth Cyan', var: '--color-synth-cyan', default: '#00d4ff' },
    { label: 'Synth Purple', var: '--color-synth-purple', default: '#b829dd' },
  ];
  
  const grid = document.createElement('div');
  grid.className = 'grid grid-cols-1 md:grid-cols-2 gap-4 mb-6';
  
  colors.forEach(color => {
    const item = document.createElement('div');
    item.className = 'flex items-center justify-between bg-[#0a0a0f] p-3 rounded border border-[#2a2a3f]/50';
    
    const label = document.createElement('span');
    label.className = 'text-xs text-[#e2e8f0] font-medium';
    label.textContent = color.label;
    item.appendChild(label);
    
    const inputWrapper = document.createElement('div');
    inputWrapper.className = 'flex items-center gap-3';
    
    const hexLabel = document.createElement('span');
    hexLabel.className = 'text-[10px] font-mono text-[#6b7280]';
    hexLabel.textContent = getComputedStyle(document.documentElement).getPropertyValue(color.var).trim() || color.default;
    
    const input = document.createElement('input');
    input.type = 'color';
    input.className = 'h-6 w-10 bg-transparent cursor-pointer border-none p-0';
    input.value = hexLabel.textContent;
    input.dataset.var = color.var; // Store var name for easy lookup
    
    input.addEventListener('input', (e) => {
      const val = (e.target as HTMLInputElement)!.value;
      document.documentElement.style.setProperty(color.var, val);
      hexLabel.textContent = val;
    });
    
    inputWrapper.appendChild(hexLabel);
    inputWrapper.appendChild(input);
    item.appendChild(inputWrapper);
    grid.appendChild(item);
  });
  
  container.appendChild(grid);
  
  // Actions
  const actions = document.createElement('div');
  actions.className = 'flex gap-3';
  
  const copyBtn = document.createElement('button');
  copyBtn.className = 'flex-1 py-2 px-4 bg-[#ff6b9d] text-[#0a0a0f] text-sm font-bold rounded hover:bg-[#ff85af] transition-colors flex items-center justify-center gap-2';
  copyBtn.innerHTML = '<span>📋</span> Copy Theme';
  
  copyBtn.addEventListener('click', () => {
    const themeSettings = colors.map(c => {
      const currentVal = getComputedStyle(document.documentElement).getPropertyValue(c.var).trim();
      return `  ${c.var}: ${currentVal || c.default};`;
    }).join('\n');
    
    const output = `HEY ANTIGRAVITY, HERE IS MY NEW THEME:\n\n@theme {\n${themeSettings}\n}`;
    navigator.clipboard.writeText(output);
    
    const originalContent = copyBtn.innerHTML;
    copyBtn.innerHTML = '<span>✅</span> Copied to Clipboard!';
    copyBtn.classList.replace('bg-[#ff6b9d]', 'bg-[#39ff14]');
    
    setTimeout(() => {
      copyBtn.innerHTML = originalContent;
      copyBtn.classList.replace('bg-[#39ff14]', 'bg-[#ff6b9d]');
    }, 2000);
  });
  
  const resetBtn = document.createElement('button');
  resetBtn.className = 'py-2 px-4 border border-[#2a2a3f] text-[#6b7280] text-sm font-medium rounded hover:text-[#e2e8f0] hover:border-[#6b7280] transition-colors';
  resetBtn.textContent = 'Reset';
  
  resetBtn.addEventListener('click', () => {
    colors.forEach(color => {
      document.documentElement.style.removeProperty(color.var);
      // Update the UI to reflect defaults
      const input = grid.querySelector(`input[data-var="${color.var}"]`) as HTMLInputElement;
      const hexLabel = input.previousElementSibling as HTMLSpanElement;
      if (input && hexLabel) {
        input.value = color.default;
        hexLabel.textContent = color.default;
      }
    });
  });
  
  actions.appendChild(copyBtn);
  actions.appendChild(resetBtn);
  container.appendChild(actions);
  
  return container;
}
