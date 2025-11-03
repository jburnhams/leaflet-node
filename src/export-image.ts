/**
 * Custom image export implementation replacing leaflet-image
 *
 * This module provides functionality to export Leaflet maps to canvas
 * without relying on the unmaintained leaflet-image package.
 */

import { createCanvas, Canvas } from '@napi-rs/canvas';
import type { SKRSContext2D } from '@napi-rs/canvas';
import { loadImageSource } from './image.js';

interface PointLike {
  x: number;
  y: number;
}

function parseCssPx(value?: string | null): number | null {
  if (!value) {
    return null;
  }

  const parsed = parseFloat(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseTransform(transform?: string | null): { x: number; y: number; hasValue: boolean } {
  if (!transform || transform === 'none') {
    return { x: 0, y: 0, hasValue: false };
  }

  let totalX = 0;
  let totalY = 0;
  let hasValue = false;

  const regex = /(matrix3d|matrix|translate3d|translate|translateX|translateY)\(([^)]*)\)/g;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(transform))) {
    const type = match[1];
    const rawArgs = match[2].split(',').map((arg) => arg.trim()).filter((arg) => arg.length > 0);

    if (type === 'matrix' && rawArgs.length >= 6) {
      const x = parseFloat(rawArgs[4]);
      const y = parseFloat(rawArgs[5]);
      if (Number.isFinite(x)) {
        totalX += x;
        hasValue = hasValue || x !== 0;
      }
      if (Number.isFinite(y)) {
        totalY += y;
        hasValue = hasValue || y !== 0;
      }
      continue;
    }

    if (type === 'matrix3d' && rawArgs.length >= 16) {
      const x = parseFloat(rawArgs[12]);
      const y = parseFloat(rawArgs[13]);
      if (Number.isFinite(x)) {
        totalX += x;
        hasValue = hasValue || x !== 0;
      }
      if (Number.isFinite(y)) {
        totalY += y;
        hasValue = hasValue || y !== 0;
      }
      continue;
    }

    if (type === 'translate3d' || type === 'translate') {
      const x = rawArgs.length >= 1 ? parseFloat(rawArgs[0]) : NaN;
      const y = rawArgs.length >= 2 ? parseFloat(rawArgs[1]) : NaN;
      if (Number.isFinite(x)) {
        totalX += x;
        hasValue = hasValue || x !== 0;
      }
      if (Number.isFinite(y)) {
        totalY += y;
        hasValue = hasValue || y !== 0;
      }
      continue;
    }

    if (type === 'translateX' && rawArgs.length >= 1) {
      const x = parseFloat(rawArgs[0]);
      if (Number.isFinite(x)) {
        totalX += x;
        hasValue = hasValue || x !== 0;
      }
      continue;
    }

    if (type === 'translateY' && rawArgs.length >= 1) {
      const y = parseFloat(rawArgs[0]);
      if (Number.isFinite(y)) {
        totalY += y;
        hasValue = hasValue || y !== 0;
      }
    }
  }

  return { x: totalX, y: totalY, hasValue };
}

function isHTMLElement(value: unknown): value is HTMLElement {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as { querySelectorAll?: unknown };
  return typeof candidate.querySelectorAll === 'function';
}

function accumulateLeafletPosition(element: HTMLElement, container: HTMLElement): PointLike | null {
  let current: HTMLElement | null = element;
  let totalX = 0;
  let totalY = 0;
  let found = false;

  while (current && current !== container) {
    const leafletPos = (current as any)._leaflet_pos as PointLike | undefined;
    if (leafletPos && Number.isFinite(leafletPos.x) && Number.isFinite(leafletPos.y)) {
      totalX += leafletPos.x;
      totalY += leafletPos.y;
      found = true;
    } else {
      const transform = parseTransform(current.style?.transform);
      if (transform.hasValue) {
        totalX += transform.x;
        totalY += transform.y;
        found = true;
      }
    }

    current = current.parentElement;
  }

  return found ? { x: totalX, y: totalY } : null;
}

function resolveElementPosition(element: HTMLElement, container: HTMLElement): PointLike {
  const accumulated = accumulateLeafletPosition(element, container);
  let x = accumulated?.x ?? 0;
  let y = accumulated?.y ?? 0;

  if (!accumulated) {
    const transform = parseTransform(element.style?.transform);
    if (transform.hasValue) {
      x += transform.x;
      y += transform.y;
    }

    const left = parseCssPx(element.style?.left);
    const top = parseCssPx(element.style?.top);

    if (left !== null) {
      x += left;
    } else if (Number.isFinite(element.offsetLeft)) {
      x += element.offsetLeft;
    }

    if (top !== null) {
      y += top;
    } else if (Number.isFinite(element.offsetTop)) {
      y += element.offsetTop;
    }
  }

  const marginLeft = parseCssPx(element.style?.marginLeft);
  if (marginLeft !== null) {
    x += marginLeft;
  }

  const marginTop = parseCssPx(element.style?.marginTop);
  if (marginTop !== null) {
    y += marginTop;
  }

  return { x, y };
}

/**
 * Export a Leaflet map to a canvas element
 *
 * @param map - The Leaflet map instance
 * @returns Promise that resolves with a Canvas element
 */
type RenderingContext = CanvasRenderingContext2D | SKRSContext2D;

export async function mapToCanvas(map: any): Promise<Canvas> {
  const size = map.getSize();
  const canvas = createCanvas(size.x, size.y);
  const ctx: RenderingContext = canvas.getContext('2d');

  // Get the map container element
  const container = map.getContainer?.();

  if (!isHTMLElement(container)) {
    throw new Error('Leaflet map container element is unavailable.');
  }

  // Find all drawable elements in the map (tile images, vector canvases, etc.)
  const drawableElements = Array.from(
    container.querySelectorAll('canvas, img')
  ) as Array<HTMLCanvasElement | HTMLImageElement>;

  // If no drawable elements found, add a temporary vector layer to force canvas creation
  let tempCircle: any = null;
  if (drawableElements.length === 0) {
    // Add a transparent circle to trigger canvas renderer creation
    const center = map.getCenter();
    const L = (globalThis as any).L;
    tempCircle = L.circle(center, {
      radius: 1,
      opacity: 0,
      fillOpacity: 0
    }).addTo(map);

    // Re-query for drawable elements
    const refreshedDrawableElements = Array.from(
      container.querySelectorAll('canvas, img')
    ) as Array<HTMLCanvasElement | HTMLImageElement>;

    drawableElements.push(...refreshedDrawableElements);

    if (drawableElements.length === 0) {
      if (tempCircle) tempCircle.remove();
      throw new Error('Unable to create canvas renderer. Map may not be properly initialized.');
    }
  }

  // Composite all drawable layers onto the export canvas respecting DOM order
  for (const element of drawableElements) {
    const tagName = element.tagName.toLowerCase();
    const { x, y } = resolveElementPosition(element as HTMLElement, container);

    if (tagName === 'canvas') {
      const napiCanvas = (element as any)._napiCanvas;

      if (!napiCanvas) {
        console.warn('Canvas element does not have _napiCanvas property, skipping');
        continue;
      }

      ctx.drawImage(napiCanvas as any, x, y);
      continue;
    }

    if (tagName === 'img') {
      const imgElement = element as HTMLImageElement;
      const src = imgElement.src;

      if (!src) {
        console.warn('Image element without src encountered during export, skipping');
        continue;
      }

      try {
        const existing = (imgElement as any)._napiImage;
        const image = existing || await loadImageSource(src);

        if (!existing) {
          (imgElement as any)._napiImage = image;
        }

        const cssWidth = parseCssPx(imgElement.style?.width);
        const cssHeight = parseCssPx(imgElement.style?.height);
        const width = cssWidth ?? (
          imgElement.width ||
          parseInt(imgElement.getAttribute('width') || '0', 10) ||
          image.width
        );
        const height = cssHeight ?? (
          imgElement.height ||
          parseInt(imgElement.getAttribute('height') || '0', 10) ||
          image.height
        );

        ctx.drawImage(image as any, x, y, width, height);
      } catch (error) {
        console.warn(`Failed to draw tile image ${src}: ${(error as Error).message}`);
      }
    }
  }

  // Clean up temporary circle if created
  if (tempCircle) {
    tempCircle.remove();
  }

  await drawPopupOverlays(map, ctx, size);

  return canvas;
}

interface PopupLayout {
  left: number;
  top: number;
  width: number;
  height: number;
  contentLines: string[];
  padding: { left: number; right: number; top: number; bottom: number };
  lineHeight: number;
  font: string;
  tipHalfDiagonal: number;
  wrapperPadding: number;
  anchor: PointLike;
}

function collectPopupLayers(map: any): any[] {
  const L = (globalThis as any).L;
  const PopupClass = L?.Popup;
  const popups: any[] = [];
  const seen = new Set<any>();

  if (map?._popup && map.hasLayer?.(map._popup)) {
    popups.push(map._popup);
    seen.add(map._popup);
  }

  const layers = map?._layers ?? {};
  for (const layer of Object.values(layers)) {
    if (
      PopupClass
      && layer instanceof PopupClass
      && map.hasLayer?.(layer)
      && !seen.has(layer)
    ) {
      popups.push(layer);
      seen.add(layer);
    }
  }

  return popups;
}

function normalisePopupText(contentNode: HTMLElement | null | undefined): string[] {
  if (!contentNode) {
    return [''];
  }

  const rawHtml = contentNode.innerHTML ?? '';
  const normalisedHtml = rawHtml.replace(/<br\s*\/?>(\s*)/gi, '\n$1');
  const decoder = contentNode.ownerDocument?.createElement('div') ?? null;
  if (decoder) {
    decoder.innerHTML = normalisedHtml;
  }
  const text = (decoder?.textContent ?? contentNode.textContent ?? '').replace(/\r/g, '');
  const lines = text.split('\n').map((line) => line.trim());
  if (lines.length === 0) {
    return [''];
  }

  // Preserve blank lines if they separate content, otherwise collapse duplicates
  const result: string[] = [];
  for (const line of lines) {
    if (!line && result.length > 0 && result[result.length - 1] === '') {
      continue;
    }
    result.push(line);
  }

  return result.length > 0 ? result : [''];
}

function measurePopupLayout(
  map: any,
  popup: any,
  ctx: RenderingContext,
  _size?: { x: number; y: number }
): PopupLayout | null {
  if (!popup || typeof popup.getLatLng !== 'function') {
    return null;
  }

  const L = (globalThis as any).L;
  if (!L) {
    return null;
  }

  const latLng = popup.getLatLng();
  const containerPoint = map.latLngToContainerPoint(latLng);
  const anchorPoint = popup._getAnchor ? L.point(popup._getAnchor()) : L.point(0, 0);
  const optionOffset = popup.options?.offset ? L.point(popup.options.offset) : L.point(0, 0);
  const anchorPosition = containerPoint.add(anchorPoint).add(optionOffset);

  const contentNode: HTMLElement | null = popup._contentNode
    ?? popup._container?.querySelector?.('.leaflet-popup-content')
    ?? null;
  const contentLines = normalisePopupText(contentNode);

  const baseFontSize = 13;
  const font = `${baseFontSize}px "Helvetica Neue", Arial, Helvetica, sans-serif`;
  const previousFont = ctx.font;
  ctx.font = font;
  const measuredWidths = contentLines.map((line) => ctx.measureText(line).width);
  ctx.font = previousFont;

  const minContentWidth = popup.options?.minWidth ?? 50;
  const maxContentWidth = popup.options?.maxWidth ?? 300;
  const measuredContentWidth = Math.max(0, ...measuredWidths);
  const constrainedContentWidth = Math.max(
    minContentWidth,
    Math.min(maxContentWidth, measuredContentWidth)
  );
  const contentWidth = constrainedContentWidth + 1; // mirrors Leaflet's +1 adjustment
  const padding = { left: 20, right: 24, top: 13, bottom: 13 };
  const wrapperPadding = 1;
  const boxWidth = contentWidth + padding.left + padding.right + wrapperPadding * 2;
  const lineHeight = baseFontSize * 1.3;
  const contentHeight = Math.max(lineHeight, lineHeight * contentLines.length);
  const boxHeight = contentHeight + padding.top + padding.bottom + wrapperPadding * 2;
  const tipHalfDiagonal = 17 / Math.SQRT2;

  const wrapperBottom = anchorPosition.y - tipHalfDiagonal;
  const left = anchorPosition.x - boxWidth / 2;
  const top = wrapperBottom - boxHeight;

  return {
    left,
    top,
    width: boxWidth,
    height: boxHeight,
    contentLines,
    padding,
    lineHeight,
    font,
    tipHalfDiagonal,
    wrapperPadding,
    anchor: { x: anchorPosition.x, y: anchorPosition.y },
  };
}

function drawRoundedRect(
  ctx: RenderingContext,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number
): void {
  const clampedRadius = Math.min(radius, width / 2, height / 2);

  ctx.beginPath();
  ctx.moveTo(x + clampedRadius, y);
  ctx.lineTo(x + width - clampedRadius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + clampedRadius);
  ctx.lineTo(x + width, y + height - clampedRadius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - clampedRadius, y + height);
  ctx.lineTo(x + clampedRadius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - clampedRadius);
  ctx.lineTo(x, y + clampedRadius);
  ctx.quadraticCurveTo(x, y, x + clampedRadius, y);
  ctx.closePath();
}

async function drawPopupOverlays(
  map: any,
  ctx: RenderingContext,
  size?: { x: number; y: number }
): Promise<void> {
  const popupLayers = collectPopupLayers(map);
  if (popupLayers.length === 0) {
    return;
  }

  for (const popup of popupLayers) {
    const layout = measurePopupLayout(map, popup, ctx, size);
    if (!layout) {
      continue;
    }

    const {
      left,
      top,
      width,
      height,
      contentLines,
      padding,
      lineHeight,
      font,
      tipHalfDiagonal,
      wrapperPadding,
      anchor,
    } = layout;

    const wrapperBottom = top + height;
    const tipCenterX = anchor.x;
    const tipCenterY = anchor.y - tipHalfDiagonal;
    const tipBaseY = wrapperBottom - wrapperPadding;
    const tipLeftBaseX = tipCenterX - tipHalfDiagonal;
    const tipRightBaseX = tipCenterX + tipHalfDiagonal;

    ctx.save();
    ctx.shadowColor = 'rgba(0, 0, 0, 0.4)';
    ctx.shadowBlur = 14;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 3;
    ctx.fillStyle = '#ffffff';
    drawRoundedRect(ctx, left, top, width, height, 12);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(tipLeftBaseX, tipBaseY);
    ctx.lineTo(anchor.x, anchor.y);
    ctx.lineTo(tipRightBaseX, tipBaseY);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    ctx.save();
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.15)';
    ctx.lineWidth = 1;

    ctx.beginPath();
    ctx.moveTo(tipLeftBaseX, tipBaseY);
    ctx.lineTo(anchor.x, anchor.y);
    ctx.lineTo(tipRightBaseX, tipBaseY);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    drawRoundedRect(ctx, left, top, width, height, 12);
    ctx.stroke();

    ctx.font = font;
    ctx.textBaseline = 'top';
    ctx.fillStyle = '#333333';
    let textY = top + wrapperPadding + padding.top;
    const textX = left + wrapperPadding + padding.left;
    for (const line of contentLines) {
      ctx.fillText(line, textX, textY);
      textY += lineHeight;
    }

    ctx.restore();
  }
}

/**
 * Export a Leaflet map to canvas (callback style for compatibility)
 *
 * @param map - The Leaflet map instance
 * @param callback - Callback function(error, canvas)
 */
export function exportMap(map: any, callback: (err: Error | null, canvas?: Canvas) => void): void {
  mapToCanvas(map)
    .then((canvas) => callback(null, canvas))
    .catch((err) => callback(err as Error));
}
