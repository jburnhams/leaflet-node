/**
 * Examples configuration for leaflet-node demo page
 * Each example is rendered both client-side (live) and server-side (PNG)
 */

const TILE_URL =
  typeof process !== 'undefined' && process.env && process.env.LEAFLET_NODE_TILE_URL
    ? process.env.LEAFLET_NODE_TILE_URL
    : 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';

const defaultUsageNotes = [
  {
    label: 'Leaflet.js setup',
    text: 'Include the Leaflet CSS and JavaScript (via CDN or your bundler), create a <div> container, then call this setup with L.map(containerId) in the browser.',
  },
  {
    label: 'leaflet-node setup',
    text: 'Install leaflet-node alongside Leaflet (npm|yarn|pnpm|bun add leaflet-node leaflet). Run on Node.js 22+ with the bundled @napi-rs/canvas (glibc ≥ 2.18 on Linux), call the same setup, set map.setSize(width, height), then await map.saveImage(...) to write an image.',
  },
];

function usageNotes(extra = []) {
  return [...defaultUsageNotes, ...extra];
}

export const examples = [
  {
    id: 'quick-start',
    title: 'Quick Start - Basic Map with Marker',
    description: 'A simple map with a marker and popup showing the basics of Leaflet',
    width: 600,
    height: 400,
    code: {
      leaflet: `import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

const map = L.map('map-container');

// Give the map an explicit size via CSS
const element = document.getElementById('map-container');
element.style.width = '600px';
element.style.height = '400px';

const londonLatLng = [51.505538, -0.090005];
map.setView(londonLatLng, 13);

L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 19,
  attribution: '© OpenStreetMap contributors'
}).addTo(map);

L.marker(londonLatLng)
  .addTo(map)
  .bindPopup('A pretty popup.<br> Easily customizable.')
  .openPopup();`,
      leafletLabel: 'Leaflet.js (Browser)',
      leafletNode: `import L from 'leaflet-node';

const container = document.createElement('div');
container.style.width = '600px';
container.style.height = '400px';

const map = L.map(container);

const londonLatLng = [51.505538, -0.090005];
map.setView(londonLatLng, 13);
map.setSize(600, 400);

L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 19,
  attribution: '© OpenStreetMap contributors'
}).addTo(map);

L.marker(londonLatLng)
  .addTo(map)
  .bindPopup('A pretty popup.<br> Easily customizable.')
  .openPopup();

await new Promise((resolve) => setTimeout(resolve, 1000));
await map.saveImage('quick-start.png');`,
      leafletNodeLabel: 'leaflet-node (Server)',
      notes: usageNotes([
        {
          label: 'Image export tip',
          text: 'In Node call await map.saveImage("quick-start.png") after the shared setup to get the PNG shown on the right.',
        },
      ]),
    },
    setup: (L, map) => {
      const londonLatLng = [51.505538, -0.090005];

      map.setView(londonLatLng, 13);

      if (typeof map.setSize === 'function') {
        map.setSize(600, 400);
      }

      L.tileLayer(TILE_URL, {
        maxZoom: 19,
        attribution: '© OpenStreetMap contributors',
      }).addTo(map);

      L.marker(londonLatLng)
        .addTo(map)
        .bindPopup('A pretty popup.<br> Easily customizable.')
        .openPopup();
    },
  },
  {
    id: 'circles-polygons',
    title: 'Circles and Polygons',
    description: 'Drawing vector layers: circles, polygons, and polylines with custom styling',
    width: 600,
    height: 400,
    code: {
      notes: usageNotes([
        {
          label: 'Vector layers',
          text: 'Circle, polygon, and polyline rendering APIs behave the same in both environments—styles translate directly to the exported PNG.',
        },
      ]),
    },
    setup: (L, map) => {
      map.setView([51.508, -0.11], 13);

      L.tileLayer(TILE_URL, {
        attribution: '© OpenStreetMap contributors',
      }).addTo(map);

      // Circle
      L.circle([51.508, -0.11], {
        color: 'red',
        fillColor: '#f03',
        fillOpacity: 0.5,
        radius: 500,
      })
        .addTo(map)
        .bindPopup('I am a circle.');

      // Polygon
      L.polygon(
        [
          [51.509, -0.08],
          [51.503, -0.06],
          [51.51, -0.047],
        ],
        {
          color: 'purple',
          fillColor: '#9b59b6',
          fillOpacity: 0.5,
        }
      )
        .addTo(map)
        .bindPopup('I am a polygon.');
    },
  },
  {
    id: 'custom-icons',
    title: 'Custom Marker Icons',
    description: 'Using custom icons for markers with different sizes and anchor points',
    width: 600,
    height: 400,
    code: {
      notes: usageNotes([
        {
          label: 'Remote assets',
          text: 'leaflet-node downloads icon images over HTTPS using undici—ensure the URLs are accessible to your server runtime.',
        },
      ]),
    },
    setup: (L, map) => {
      map.setView([51.5, -0.09], 13);

      L.tileLayer(TILE_URL, {
        attribution: '© OpenStreetMap contributors',
      }).addTo(map);

      // Default icon
      L.marker([51.5, -0.09]).addTo(map).bindPopup('Default icon');

      // Create custom icon
      const greenIcon = L.icon({
        iconUrl:
          'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-green.png',
        shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
        iconSize: [25, 41],
        iconAnchor: [12, 41],
        popupAnchor: [1, -34],
        shadowSize: [41, 41],
      });

      L.marker([51.51, -0.1], { icon: greenIcon }).addTo(map).bindPopup('Green icon');
    },
  },
  {
    id: 'geojson-simple',
    title: 'GeoJSON Layer',
    description: 'Displaying GeoJSON data with custom styling',
    width: 600,
    height: 400,
    code: {
      notes: usageNotes([
        {
          label: 'Data loading',
          text: 'Both builds accept plain GeoJSON objects—load or fetch your data before calling the shared setup.',
        },
      ]),
    },
    setup: (L, map) => {
      map.setView([39.74739, -105], 13);

      L.tileLayer(TILE_URL, {
        attribution: '© OpenStreetMap contributors',
      }).addTo(map);

      const geojsonFeature = {
        type: 'Feature',
        properties: {
          name: 'Coors Field',
          amenity: 'Baseball Stadium',
          popupContent: 'This is where the Rockies play!',
        },
        geometry: {
          type: 'Point',
          coordinates: [-104.99404, 39.75621],
        },
      };

      L.geoJSON(geojsonFeature, {
        onEachFeature: (feature, layer) => {
          if (feature.properties?.popupContent) {
            layer.bindPopup(feature.properties.popupContent);
          }
        },
      }).addTo(map);
    },
  },
  {
    id: 'polylines',
    title: 'Polylines and Routes',
    description: 'Drawing lines and routes with multiple styling options',
    width: 600,
    height: 400,
    code: {
      notes: usageNotes([
        {
          label: 'Multiple polylines',
          text: 'You can add any number of polylines before exporting—leaflet-node batches the draw calls exactly as the browser does.',
        },
      ]),
    },
    setup: (L, map) => {
      map.setView([45.51, -122.68], 13);

      L.tileLayer(TILE_URL, {
        attribution: '© OpenStreetMap contributors',
      }).addTo(map);

      // Simple polyline
      const latlngs = [
        [45.51, -122.68],
        [45.5, -122.69],
        [45.52, -122.7],
      ];

      L.polyline(latlngs, {
        color: 'blue',
        weight: 5,
        opacity: 0.7,
      })
        .addTo(map)
        .bindPopup('This is a blue route');

      // Multi-segment polyline
      const multiLatLngs = [
        [45.51, -122.67],
        [45.5, -122.66],
        [45.52, -122.65],
      ];

      L.polyline(multiLatLngs, {
        color: 'red',
        weight: 5,
        opacity: 0.7,
        dashArray: '10, 10',
      })
        .addTo(map)
        .bindPopup('Dashed red route');
    },
  },
  {
    id: 'layer-groups',
    title: 'Layer Groups',
    description: 'Organizing multiple layers into groups for easier management',
    width: 600,
    height: 400,
    code: {
      notes: usageNotes([
        {
          label: 'Layer ordering',
          text: 'LayerGroup logic is identical—the order in which you add layers controls z-index in both Leaflet.js and leaflet-node.',
        },
      ]),
    },
    setup: (L, map) => {
      map.setView([39.73, -104.99], 10);

      L.tileLayer(TILE_URL, {
        attribution: '© OpenStreetMap contributors',
      }).addTo(map);

      // Create a layer group with multiple markers
      const cities = L.layerGroup([
        L.marker([39.61, -105.02]).bindPopup('This is Littleton, CO.'),
        L.marker([39.74, -104.99]).bindPopup('This is Denver, CO.'),
        L.marker([39.73, -104.8]).bindPopup('This is Aurora, CO.'),
        L.marker([39.77, -105.23]).bindPopup('This is Golden, CO.'),
      ]);

      // Create another layer group
      const parks = L.layerGroup([
        L.circle([39.74, -105.0], {
          color: 'green',
          fillColor: '#0f0',
          fillOpacity: 0.3,
          radius: 2000,
        }).bindPopup('City Park'),
        L.circle([39.73, -105.15], {
          color: 'green',
          fillColor: '#0f0',
          fillOpacity: 0.3,
          radius: 3000,
        }).bindPopup('Bear Creek Park'),
      ]);

      cities.addTo(map);
      parks.addTo(map);
    },
  },
  {
    id: 'zoom-levels',
    title: 'Different Zoom Levels',
    description: 'Demonstrating zoom level control and bounds',
    width: 600,
    height: 400,
    code: {
      notes: usageNotes([
        {
          label: 'Zoom controls',
          text: 'minZoom/maxZoom behave the same everywhere—leaflet-node respects the bounds when generating tiles for export.',
        },
      ]),
    },
    setup: (L, map) => {
      map.setView([40.7128, -74.006], 11);

      L.tileLayer(TILE_URL, {
        attribution: '© OpenStreetMap contributors',
        minZoom: 10,
        maxZoom: 15,
      }).addTo(map);

      // Add markers at different points
      L.marker([40.7128, -74.006]).addTo(map).bindPopup('New York City');
      L.marker([40.758, -73.9855]).addTo(map).bindPopup('Times Square');
      L.marker([40.6892, -74.0445]).addTo(map).bindPopup('Statue of Liberty');

      // Draw bounds rectangle
      const bounds = [
        [40.712, -74.227],
        [40.774, -74.125],
      ];
      L.rectangle(bounds, {
        color: '#ff7800',
        weight: 2,
        fillOpacity: 0.1,
      }).addTo(map);
    },
  },
  {
    id: 'popup-options',
    title: 'Popup Customization',
    description: 'Various popup configurations and styling options',
    width: 600,
    height: 400,
    code: {
      notes: usageNotes([
        {
          label: 'HTML content',
          text: 'leaflet-node renders popup HTML (including inline images) using jsdom—make sure external image URLs permit server access.',
        },
      ]),
    },
    setup: (L, map) => {
      map.setView([48.8566, 2.3522], 12);

      L.tileLayer(TILE_URL, {
        attribution: '© OpenStreetMap contributors',
      }).addTo(map);

      // Standard popup
      L.marker([48.8566, 2.3522]).addTo(map).bindPopup('A standard popup');

      // Custom popup with HTML
      L.marker([48.8606, 2.3376])
        .addTo(map)
        .bindPopup(
          '<b>Eiffel Tower</b><br>Famous landmark<br><img src="https://upload.wikimedia.org/wikipedia/commons/thumb/a/a8/Tour_Eiffel_Wikimedia_Commons.jpg/50px-Tour_Eiffel_Wikimedia_Commons.jpg" alt="Eiffel Tower" style="max-width:100px;">'
        );

      // Standalone popup
      L.popup().setLatLng([48.8529, 2.3499]).setContent('I am a standalone popup.').openOn(map);
    },
  },
  {
    id: 'multiple-layers',
    title: 'Multiple Tile Layers',
    description: 'Using different tile providers and overlays',
    width: 600,
    height: 400,
    code: {
      notes: usageNotes([
        {
          label: 'Tile providers',
          text: 'Swap in any compatible tile URL template—the same attribution and access rules apply in the browser and in Node.',
        },
      ]),
    },
    setup: (L, map) => {
      map.setView([37.7749, -122.4194], 12);

      // Using a different tile provider
      L.tileLayer(TILE_URL, {
        attribution: '© OpenStreetMap contributors',
      }).addTo(map);

      // Add some markers to show San Francisco landmarks
      L.marker([37.7749, -122.4194]).addTo(map).bindPopup('San Francisco');

      L.marker([37.8199, -122.4783]).addTo(map).bindPopup('Golden Gate Bridge');

      L.circle([37.7749, -122.4194], {
        color: 'blue',
        fillColor: '#30f',
        fillOpacity: 0.2,
        radius: 3000,
      })
        .addTo(map)
        .bindPopup('Downtown Area');
    },
  },
  {
    id: 'geojson-styled',
    title: 'Styled GeoJSON Features',
    description: 'GeoJSON with custom styling based on properties',
    width: 600,
    height: 400,
    code: {
      notes: usageNotes([
        {
          label: 'Dynamic styling',
          text: 'Style callbacks receive the same feature data in both runtimes, so property-based fills translate directly to PNG output.',
        },
      ]),
    },
    setup: (L, map) => {
      map.setView([40, -100], 4);

      L.tileLayer(TILE_URL, {
        attribution: '© OpenStreetMap contributors',
      }).addTo(map);

      const states = {
        type: 'FeatureCollection',
        features: [
          {
            type: 'Feature',
            properties: { party: 'Republican', name: 'Texas' },
            geometry: {
              type: 'Polygon',
              coordinates: [
                [
                  [-106.65, 31.85],
                  [-93.51, 33.97],
                  [-94.04, 33.54],
                  [-106.65, 31.85],
                ],
              ],
            },
          },
          {
            type: 'Feature',
            properties: { party: 'Democrat', name: 'California' },
            geometry: {
              type: 'Polygon',
              coordinates: [
                [
                  [-124.39, 42.0],
                  [-120.0, 42.0],
                  [-114.13, 35.0],
                  [-124.39, 32.53],
                  [-124.39, 42.0],
                ],
              ],
            },
          },
        ],
      };

      L.geoJSON(states, {
        style: (feature) => {
          return {
            fillColor: feature.properties.party === 'Republican' ? '#ff0000' : '#0000ff',
            weight: 2,
            opacity: 1,
            color: 'white',
            fillOpacity: 0.5,
          };
        },
        onEachFeature: (feature, layer) => {
          layer.bindPopup(feature.properties.name);
        },
      }).addTo(map);
    },
  },
];
