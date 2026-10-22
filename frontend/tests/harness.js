import {act} from 'react';
import {createRoot} from 'react-dom/client';

// A small render helper. The project deliberately avoids a testing-library
// dependency, so the tests drive the DOM the way a reader would: real events
// into real elements, with React's act() around every state change.
const mounted = [];

export async function render(ui) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => { root.render(ui); });
  const handle = {
    container,
    root,
    get text() { return container.textContent; },
    get html() { return container.innerHTML; },
    query: selector => container.querySelector(selector),
    queryAll: selector => [...container.querySelectorAll(selector)],
    async update(next) { await act(async () => { root.render(next); }); },
    async unmount() {
      await act(async () => { root.unmount(); });
      container.remove();
      const index = mounted.indexOf(handle);
      if (index >= 0) mounted.splice(index, 1);
    },
  };
  mounted.push(handle);
  return handle;
}

export async function click(element) {
  if (!element) throw new Error('click: element is missing');
  await act(async () => {
    element.dispatchEvent(new window.MouseEvent('click', {bubbles: true, cancelable: true}));
  });
}

export async function change(element, value) {
  if (!element) throw new Error('change: element is missing');
  await act(async () => {
    element.value = value;
    element.dispatchEvent(new window.Event('change', {bubbles: true}));
  });
}

export async function type(element, value) {
  await act(async () => {
    element.value = value;
    element.dispatchEvent(new window.Event('input', {bubbles: true}));
  });
}

export async function cleanup() {
  while (mounted.length) await mounted[mounted.length - 1].unmount();
}
