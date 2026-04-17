import type { Project } from '../lib/commands';

interface ProjectCardProps {
  project: Project & { id: string };
  onClick?: (projectId: string) => void;
}

export function createProjectCard(props: ProjectCardProps): HTMLElement {
  const { project, onClick } = props;
  
  const card = document.createElement('div');
  card.className = 'project-card flex-shrink-0 w-64 bg-[#15151f] border border-[#2a2a3f] rounded-lg overflow-hidden cursor-pointer hover:border-[#00d4ff] transition-all duration-300 group';
  
  // Image placeholder with gradient
  const imageContainer = document.createElement('div');
  imageContainer.className = 'h-32 bg-gradient-to-br from-[#ff6b9d]/20 to-[#00d4ff]/20 flex items-center justify-center relative overflow-hidden';
  
  // Abstract pattern overlay
  const pattern = document.createElement('div');
  pattern.className = 'absolute inset-0 opacity-30';
  pattern.style.backgroundImage = `
    radial-gradient(circle at 30% 40%, rgba(255, 107, 157, 0.4) 0%, transparent 50%),
    radial-gradient(circle at 70% 60%, rgba(0, 212, 255, 0.4) 0%, transparent 50%)
  `;
  imageContainer.appendChild(pattern);
  
  // Project initial/icon
  const icon = document.createElement('div');
  icon.className = 'relative z-10 text-4xl font-bold text-[#e2e8f0]/50 group-hover:text-[#00d4ff] transition-colors';
  icon.textContent = project.name[0].toUpperCase();
  imageContainer.appendChild(icon);
  
  // Category badge
  const badge = document.createElement('div');
  badge.className = 'absolute top-2 right-2 px-2 py-1 bg-[#0a0a0f]/80 rounded text-[10px] text-[#6b7280] uppercase tracking-wider';
  badge.textContent = project.category;
  imageContainer.appendChild(badge);
  
  card.appendChild(imageContainer);
  
  // Content
  const content = document.createElement('div');
  content.className = 'p-3';
  
  const title = document.createElement('h3');
  title.className = 'text-sm font-semibold text-[#e2e8f0] mb-1 group-hover:text-[#00d4ff] transition-colors';
  title.textContent = project.name;
  content.appendChild(title);
  
  const year = document.createElement('div');
  year.className = 'text-[10px] text-[#6b7280] mb-2';
  year.textContent = project.year;
  content.appendChild(year);
  
  const desc = document.createElement('p');
  desc.className = 'text-xs text-[#6b7280] line-clamp-2 leading-relaxed';
  desc.textContent = project.description;
  content.appendChild(desc);
  
  // Tech tags
  const tags = document.createElement('div');
  tags.className = 'flex flex-wrap gap-1 mt-3';
  project.tech.slice(0, 3).forEach(t => {
    const tag = document.createElement('span');
    tag.className = 'px-1.5 py-0.5 bg-[#2a2a3f] rounded text-[9px] text-[#6b7280]';
    tag.textContent = t;
    tags.appendChild(tag);
  });
  content.appendChild(tags);
  
  card.appendChild(content);
  
  // Click handler
  if (onClick) {
    card.addEventListener('click', () => onClick(project.id));
  }
  
  return card;
}

interface CarouselProps {
  title: string;
  items: HTMLElement[];
}

export function createCarousel(props: CarouselProps): HTMLElement {
  const { title, items } = props;
  
  const container = document.createElement('div');
  container.className = 'mb-6';
  
  // Header
  const header = document.createElement('div');
  header.className = 'flex items-center justify-between mb-3 px-1';
  
  const titleEl = document.createElement('h3');
  titleEl.className = 'text-xs text-[#6b7280] uppercase tracking-wider';
  titleEl.textContent = title;
  header.appendChild(titleEl);
  
  const count = document.createElement('span');
  count.className = 'text-[10px] text-[#6b7280]';
  count.textContent = `${items.length} items`;
  header.appendChild(count);
  
  container.appendChild(header);
  
  // Scrollable container
  const scrollContainer = document.createElement('div');
  scrollContainer.className = 'flex gap-3 overflow-x-auto pb-2 scrollbar-thin';
  scrollContainer.style.scrollbarWidth = 'thin';
  scrollContainer.style.scrollbarColor = '#2a2a3f transparent';
  
  items.forEach(item => {
    scrollContainer.appendChild(item);
  });
  
  container.appendChild(scrollContainer);
  
  return container;
}
