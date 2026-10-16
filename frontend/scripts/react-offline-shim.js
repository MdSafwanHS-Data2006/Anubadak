/**
 * Lightweight React 18 compatible functional component & hooks runtime used ONLY when
 * building inside an offline sandbox VM where `npm install` cannot access the internet.
 * When `node_modules/react` is installed on a developer machine, Vite uses standard React.
 */

let currentHookComponent = null;
let currentHookIndex = 0;

const Fragment = Symbol.for('react.fragment');
const StrictMode = ({ children }) => children;

function createElement(type, props, ...children) {
  const normalizedProps = { ...(props || {}) };
  const flatChildren = [];

  const pushChild = (child) => {
    if (Array.isArray(child)) {
      child.forEach(pushChild);
    } else if (child !== null && child !== undefined && child !== false && child !== true) {
      flatChildren.push(child);
    }
  };
  children.forEach(pushChild);

  if (flatChildren.length === 1) {
    normalizedProps.children = flatChildren[0];
  } else if (flatChildren.length > 1) {
    normalizedProps.children = flatChildren;
  }

  return {
    $$typeof: Symbol.for('react.element'),
    type,
    props: normalizedProps,
    key: normalizedProps.key !== undefined ? normalizedProps.key : null,
    ref: normalizedProps.ref !== undefined ? normalizedProps.ref : null,
  };
}

function getHookState() {
  if (!currentHookComponent) {
    throw new Error('Hooks can only be called inside a component render.');
  }
  const idx = currentHookIndex++;
  const hooks = currentHookComponent.hooks;
  if (idx >= hooks.length) {
    hooks.push({});
  }
  return { hook: hooks[idx], instance: currentHookComponent };
}

function depsChanged(prevDeps, nextDeps) {
  if (!prevDeps || !nextDeps) return true;
  if (prevDeps.length !== nextDeps.length) return true;
  for (let i = 0; i < prevDeps.length; i += 1) {
    if (!Object.is(prevDeps[i], nextDeps[i])) return true;
  }
  return false;
}

function useState(initialValue) {
  const { hook, instance } = getHookState();
  if (!('value' in hook)) {
    hook.value = typeof initialValue === 'function' ? initialValue() : initialValue;
  }
  const setState = (updater) => {
    const nextValue = typeof updater === 'function' ? updater(hook.value) : updater;
    if (!Object.is(nextValue, hook.value)) {
      hook.value = nextValue;
      instance.scheduleRender();
    }
  };
  return [hook.value, setState];
}

function useRef(initialValue) {
  const { hook } = getHookState();
  if (!('ref' in hook)) {
    hook.ref = { current: initialValue };
  }
  return hook.ref;
}

function useCallback(fn, deps) {
  const { hook } = getHookState();
  if (depsChanged(hook.deps, deps)) {
    hook.fn = fn;
    hook.deps = deps;
  }
  return hook.fn;
}

function useMemo(factory, deps) {
  const { hook } = getHookState();
  if (depsChanged(hook.deps, deps)) {
    hook.value = factory();
    hook.deps = deps;
  }
  return hook.value;
}

function useEffect(effectFn, deps) {
  const { hook, instance } = getHookState();
  if (depsChanged(hook.deps, deps)) {
    hook.deps = deps;
    instance.pendingEffects.push(() => {
      if (typeof hook.cleanup === 'function') {
        try {
          hook.cleanup();
        } catch (_e) {
          // ignore cleanup error
        }
      }
      const cleanup = effectFn();
      hook.cleanup = typeof cleanup === 'function' ? cleanup : null;
    });
  }
}

const SVG_TAGS = new Set([
  'svg',
  'g',
  'path',
  'line',
  'circle',
  'polygon',
  'rect',
  'defs',
  'linearGradient',
  'stop',
]);

function applyPropsToDom(domNode, props, isSvg) {
  Object.keys(props).forEach((key) => {
    if (key === 'children' || key === 'key' || key === 'ref') return;
    const val = props[key];

    if (key.startsWith('on') && typeof val === 'function') {
      const eventName = key.slice(2).toLowerCase();
      if (eventName === 'change' && (domNode.tagName === 'TEXTAREA' || domNode.tagName === 'INPUT')) {
        domNode.addEventListener('input', val);
      } else {
        domNode.addEventListener(eventName, val);
      }
      return;
    }

    if (key === 'className') {
      if (isSvg) {
        domNode.setAttribute('class', val || '');
      } else {
        domNode.className = val || '';
      }
      return;
    }

    if (key === 'htmlFor') {
      domNode.setAttribute('for', val || '');
      return;
    }

    if (key === 'value' && ('value' in domNode)) {
      if (domNode.value !== String(val ?? '')) {
        domNode.value = String(val ?? '');
      }
      domNode.setAttribute('value', String(val ?? ''));
      return;
    }

    if (key === 'disabled' || key === 'checked' || key === 'selected') {
      domNode[key] = Boolean(val);
      if (val) {
        domNode.setAttribute(key, '');
      } else {
        domNode.removeAttribute(key);
      }
      return;
    }

    if (key.startsWith('aria-') || key.startsWith('data-') || key === 'role' || key === 'lang' || key === 'id' || key === 'title' || key === 'placeholder' || key === 'type' || key === 'min' || key === 'max' || key === 'step' || key === 'rows' || key === 'tabIndex' || isSvg) {
      if (val !== null && val !== undefined && val !== false) {
        const attrName = key === 'tabIndex' ? 'tabindex' : key;
        domNode.setAttribute(attrName, String(val));
      }
      return;
    }

    if (val !== null && val !== undefined) {
      try {
        domNode[key] = val;
      } catch (_e) {
        domNode.setAttribute(key, String(val));
      }
    }
  });
}

function createRoot(container) {
  let rootVNode = null;
  const componentMap = new Map();
  let isRendering = false;
  let queuedRender = false;

  function renderVNode(vnode, pathKey, isSvg = false) {
    if (vnode === null || vnode === undefined || typeof vnode === 'boolean') {
      return document.createTextNode('');
    }

    if (typeof vnode === 'string' || typeof vnode === 'number') {
      return document.createTextNode(String(vnode));
    }

    if (Array.isArray(vnode)) {
      const frag = document.createDocumentFragment();
      vnode.forEach((child, idx) => {
        frag.appendChild(renderVNode(child, `${pathKey}.${idx}`, isSvg));
      });
      return frag;
    }

    if (vnode.type === Fragment || vnode.type === StrictMode) {
      return renderVNode(vnode.props.children, `${pathKey}.f`, isSvg);
    }

    if (typeof vnode.type === 'function') {
      const compId = `${pathKey}:${vnode.type.name || 'fn'}`;
      let instance = componentMap.get(compId);
      if (!instance) {
        instance = {
          hooks: [],
          pendingEffects: [],
          scheduleRender: () => triggerRender(),
        };
        componentMap.set(compId, instance);
      }

      const prevComp = currentHookComponent;
      const prevIdx = currentHookIndex;
      currentHookComponent = instance;
      currentHookIndex = 0;

      let renderedChild = null;
      try {
        renderedChild = vnode.type(vnode.props || {});
      } finally {
        currentHookComponent = prevComp;
        currentHookIndex = prevIdx;
      }

      const dom = renderVNode(renderedChild, `${compId}>`, isSvg);
      return dom;
    }

    const tagName = String(vnode.type);
    const nextIsSvg = isSvg || SVG_TAGS.has(tagName);
    const domNode = nextIsSvg
      ? document.createElementNS('http://www.w3.org/2000/svg', tagName)
      : document.createElement(tagName);

    const children = vnode.props ? vnode.props.children : null;
    if (children !== undefined && children !== null) {
      if (Array.isArray(children)) {
        children.forEach((c, idx) => {
          domNode.appendChild(renderVNode(c, `${pathKey}/${idx}`, nextIsSvg));
        });
      } else {
        domNode.appendChild(renderVNode(children, `${pathKey}/0`, nextIsSvg));
      }
    }

    if (vnode.props) {
      applyPropsToDom(domNode, vnode.props, nextIsSvg);
    }

    if (vnode.ref && typeof vnode.ref === 'object') {
      vnode.ref.current = domNode;
    }

    return domNode;
  }

  function flushEffects() {
    componentMap.forEach((instance) => {
      const effects = instance.pendingEffects.splice(0, instance.pendingEffects.length);
      effects.forEach((run) => run());
    });
  }

  function triggerRender() {
    if (isRendering) {
      queuedRender = true;
      return;
    }
    isRendering = true;
    try {
      // Preserve active element focus & selection across re-renders
      const activeEl = document.activeElement;
      const activeTestId = activeEl && activeEl.getAttribute ? activeEl.getAttribute('data-testid') : null;
      const selStart = activeEl && typeof activeEl.selectionStart === 'number' ? activeEl.selectionStart : null;
      const selEnd = activeEl && typeof activeEl.selectionEnd === 'number' ? activeEl.selectionEnd : null;

      const domTree = renderVNode(rootVNode, 'root', false);
      container.innerHTML = '';
      container.appendChild(domTree);

      if (activeTestId) {
        const nextActive = container.querySelector(`[data-testid="${activeTestId}"]`);
        if (nextActive && typeof nextActive.focus === 'function') {
          nextActive.focus();
          if (selStart !== null && typeof nextActive.setSelectionRange === 'function') {
            try {
              nextActive.setSelectionRange(selStart, selEnd);
            } catch (_e) {
              // ignore selection range error
            }
          }
        }
      }

      flushEffects();
    } finally {
      isRendering = false;
      if (queuedRender) {
        queuedRender = false;
        triggerRender();
      }
    }
  }

  return {
    render(vnode) {
      rootVNode = vnode;
      triggerRender();
    },
  };
}

const React = {
  createElement,
  Fragment,
  StrictMode,
  useState,
  useEffect,
  useRef,
  useCallback,
  useMemo,
};

export {
  React as default,
  createElement,
  Fragment,
  StrictMode,
  useState,
  useEffect,
  useRef,
  useCallback,
  useMemo,
  createRoot,
};
