import type { Project } from '../lib/commands';

interface ProjectCardProps {
  project: Project & { id: string };
  onClick?: (projectId: string) => void;
}

export function createProjectCard(props: ProjectCardProps): HTMLElement {
  const { project, onClick } = props;
  
  const card = document.createElement('div');
  card.className = 'project-card flex-shrink-0 w-64 bg-[#15151f] border border-[#2a2a3f] rounded-lg overflow-hidden cursor-pointer hover:border-[#00d4ff] transition-all duration-300 group';
  
  // Image placeholder
  const imageContainer = document.createElement('div');
  imageContainer.className = 'h-32 bg-[#0d0d12] flex items-center justify-center relative overflow-hidden';
  
  // Project initial/icon
  const icon = document.createElement('div');
  icon.className = 'relative z-10 text-4xl font-bold text-[#e2e8f0]/50 group-hover:text-[#00d4ff] transition-colors';
  icon.textContent = project.name[0].toUpperCase();
  imageContainer.appendChild(icon);
  
  // Category badge
  const badge = document.createElement('div');
  badge.className = 'absolute top-2 right-2 px-2 py-1 bg-[#0a0a0f]/80 rounded text-[10px] text-[#a0a0af] uppercase tracking-wider font-semibold';
  badge.textContent = project.category;
  imageContainer.appendChild(badge);
  
  card.appendChild(imageContainer);
  
  // Content
  const content = document.createElement('div');
  content.className = 'p-3';
  
  const title = document.createElement('h2');
  title.className = 'text-sm font-semibold text-[#e2e8f0] mb-1 group-hover:text-[#00d4ff] transition-colors';
  title.textContent = project.name;
  content.appendChild(title);
  
  const year = document.createElement('div');
  year.className = 'text-[10px] text-[#a0a0af] mb-2 font-mono';
  year.textContent = project.year;
  content.appendChild(year);
  
  const desc = document.createElement('p');
  desc.className = 'text-xs text-[#beb9cc] line-clamp-2 leading-relaxed';
  desc.textContent = project.description;
  content.appendChild(desc);
  
  // Tech tags
  const tags = document.createElement('div');
  tags.className = 'flex flex-wrap gap-1 mt-3';
  project.tech.slice(0, 3).forEach(t => {
    const tag = document.createElement('span');
    tag.className = 'px-1.5 py-0.5 bg-[#2a2a3f] rounded text-[9px] text-[#a0a0af] font-mono';
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
  
  const titleEl = document.createElement('h2');
  titleEl.className = 'text-xs text-[#a0a0af] uppercase tracking-wider font-semibold';
  titleEl.textContent = title;
  header.appendChild(titleEl);
  
  const count = document.createElement('span');
  count.className = 'text-[10px] text-[#a0a0af] font-mono';
  count.textContent = `${items.length} items`;
  header.appendChild(count);
  
  container.appendChild(header);
  
  // Grid container (no horizontal scroll)
  const gridContainer = document.createElement('div');
  gridContainer.className = 'flex flex-wrap gap-3 pb-2';
  
  items.forEach(item => {
    gridContainer.appendChild(item);
  });
  
  container.appendChild(gridContainer);
  
  return container;
}
