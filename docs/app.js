/**
 * Client-side application for rendering Leaflet examples
 */

import { examples } from './examples.js';

function formatCode(codeString) {
  if (!codeString) {
    return '';
  }

  const lines = codeString.replace(/\r\n/g, '\n').split('\n');

  while (lines.length && !lines[0].trim()) {
    lines.shift();
  }

  while (lines.length && !lines[lines.length - 1].trim()) {
    lines.pop();
  }

  const indent = lines.reduce((min, line) => {
    if (!line.trim()) {
      return min;
    }

    const match = line.match(/^(\s+)/);
    const leading = match ? match[1].length : 0;
    return Math.min(min, leading);
  }, Infinity);

  const normalized =
    indent === Infinity
      ? lines
      : lines.map((line) => (line.startsWith(' '.repeat(indent)) ? line.slice(indent) : line));

  return normalized.join('\n');
}

function createCodeBlock(label, codeString) {
  const wrapper = document.createElement('div');
  wrapper.className = 'code-block';

  if (label) {
    const blockLabel = document.createElement('div');
    blockLabel.className = 'code-block-label';
    blockLabel.textContent = label;
    wrapper.appendChild(blockLabel);
  }

  const pre = document.createElement('pre');
  const code = document.createElement('code');
  code.textContent = formatCode(codeString);
  pre.appendChild(code);
  wrapper.appendChild(pre);

  return wrapper;
}

function createNotesList(notes = []) {
  if (!Array.isArray(notes) || notes.length === 0) {
    return null;
  }

  const wrapper = document.createElement('div');
  wrapper.className = 'code-notes';

  const heading = document.createElement('div');
  heading.className = 'code-notes-heading';
  heading.textContent = 'Setup differences & dependencies';
  wrapper.appendChild(heading);

  const list = document.createElement('ul');
  list.className = 'code-notes-list';

  notes.forEach((note) => {
    const item = document.createElement('li');
    const strong = document.createElement('strong');
    strong.textContent = `${note.label}: `;
    item.appendChild(strong);
    item.appendChild(document.createTextNode(note.text));
    list.appendChild(item);
  });

  wrapper.appendChild(list);
  return wrapper;
}

function createCodeSection(example) {
  const codeDetails = example.code || {};
  const elements = [];

  const hasSeparateBlocks = Boolean(codeDetails.leaflet || codeDetails.leafletNode);

  if (hasSeparateBlocks) {
    const columns = document.createElement('div');
    columns.className = 'code-columns';

    if (codeDetails.leaflet) {
      const label = codeDetails.leafletLabel || 'Leaflet.js (browser)';
      columns.appendChild(createCodeBlock(label, codeDetails.leaflet));
    }

    if (codeDetails.leafletNode) {
      const label = codeDetails.leafletNodeLabel || 'leaflet-node (Node.js)';
      columns.appendChild(createCodeBlock(label, codeDetails.leafletNode));
    }

    if (columns.childElementCount > 0) {
      elements.push(columns);
    }
  } else {
    const sharedCode =
      codeDetails.shared || (typeof example.setup === 'function' ? example.setup.toString() : '');

    if (sharedCode) {
      const label = codeDetails.sharedLabel || 'Shared Leaflet setup (browser + Node)';
      elements.push(createCodeBlock(label, sharedCode));
    }
  }

  const notesElement = createNotesList(codeDetails.notes);
  if (notesElement) {
    elements.push(notesElement);
  }

  const descriptionText =
    codeDetails.description ||
    `Use this configuration with Leaflet.js in the browser or leaflet-node on the server. In Node set the map size to ${example.width}×${example.height} before exporting.`;

  if (elements.length === 0 && !descriptionText) {
    return null;
  }

  const section = document.createElement('details');
  section.className = 'example-code';

  const summary = document.createElement('summary');
  summary.className = 'code-summary';
  summary.textContent = codeDetails.heading || 'Code & setup';
  section.appendChild(summary);

  const content = document.createElement('div');
  content.className = 'code-content';

  if (descriptionText) {
    const description = document.createElement('p');
    description.className = 'code-description';
    description.textContent = descriptionText;
    content.appendChild(description);
  }

  elements.forEach((element) => {
    content.appendChild(element);
  });

  section.appendChild(content);

  return section;
}

/**
 * Initialize and render all examples
 */
function initializeExamples() {
  const container = document.getElementById('examples-container');

  examples.forEach((example) => {
    // Create example wrapper
    const exampleDiv = document.createElement('div');
    exampleDiv.className = 'example';
    exampleDiv.id = `example-${example.id}`;

    // Create header
    const header = document.createElement('div');
    header.className = 'example-header';
    header.innerHTML = `
      <h3>${example.title}</h3>
      <p>${example.description}</p>
    `;

    const codeSection = createCodeSection(example);

    // Create content container
    const content = document.createElement('div');
    content.className = 'example-content';

    // Client-side (live map)
    const clientSide = document.createElement('div');
    clientSide.className = 'example-side client-side';
    clientSide.innerHTML = `
      <h4>Client-Side (Interactive)</h4>
      <div class="map-container" id="map-${example.id}">
        <div class="loading">Loading map...</div>
      </div>
    `;

    const mapContainer = clientSide.querySelector('.map-container');
    if (mapContainer && example.width && example.height) {
      mapContainer.style.width = `${example.width}px`;
      mapContainer.style.height = `${example.height}px`;
    }

    // Server-side (PNG image)
    const serverSide = document.createElement('div');
    serverSide.className = 'example-side server-side';
    serverSide.innerHTML = `
      <h4>Server-Side (Generated PNG)</h4>
      <img
        src="images/${example.id}.png"
        alt="${example.title} - Server-side generated"
        class="server-image"
        loading="lazy"
        onerror="this.alt='Image not yet generated. Run the build script to generate images.'; this.style.objectFit='contain'; this.style.padding='20px';"
      />
    `;

    const serverImage = serverSide.querySelector('img.server-image');
    if (serverImage && example.width && example.height) {
      serverImage.style.width = `${example.width}px`;
      serverImage.style.height = `${example.height}px`;
    }

    // Assemble the example
    exampleDiv.appendChild(header);
    if (codeSection) {
      exampleDiv.appendChild(codeSection);
    }
    content.appendChild(clientSide);
    content.appendChild(serverSide);
    exampleDiv.appendChild(content);
    container.appendChild(exampleDiv);

    // Initialize the client-side map
    initializeMap(example);
  });
}

/**
 * Initialize a single map example
 */
function initializeMap(example) {
  // Wait a bit for the DOM to be ready
  setTimeout(() => {
    const mapElement = document.getElementById(`map-${example.id}`);
    if (!mapElement) {
      console.error(`Map element not found for ${example.id}`);
      return;
    }

    // Remove loading message
    const loading = mapElement.querySelector('.loading');
    if (loading) {
      loading.remove();
    }

    try {
      // Create the map
      const map = L.map(`map-${example.id}`, {
        // Disable some features for consistency
        zoomControl: true,
        attributionControl: true,
      });

      // Set custom size if specified
      if (example.width && example.height) {
        mapElement.style.width = `${example.width}px`;
        mapElement.style.height = `${example.height}px`;
      }

      // Run the example setup
      example.setup(L, map);

      // Add a small delay to ensure tiles load
      setTimeout(() => {
        map.invalidateSize();
      }, 100);
    } catch (error) {
      console.error(`Error initializing map ${example.id}:`, error);
      mapElement.innerHTML = `<div class="loading" style="color: red;">Error loading map</div>`;
    }
  }, 100);
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeExamples);
} else {
  initializeExamples();
}
