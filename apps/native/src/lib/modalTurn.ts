import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';

/**
 * iOS presents each RN <Modal> from the nearest view controller up its own
 * view tree (RCTModalHostViewComponentView → reactViewController). Every
 * modal rendered in the app's main tree therefore presents from the root
 * controller, and a controller presents one thing at a time: a second
 * present while another modal is up — or still dismissing — is dropped by
 * UIKit, while RN goes on believing it is shown. The sheet never appears,
 * and its host can't be presented again until it unmounts.
 *
 * The web has no such limit (one sheet closing as the next opens, a confirm
 * over an open sheet), so root-level modals take turns here: one that wants
 * to show waits until the current one has gone, including its dismissal.
 * A modal rendered inside another modal's content presents from that
 * modal's controller and stacks normally, so it skips the queue — modals
 * mark their content with ModalNestingContext for that. Android presents
 * modals as independent dialogs and needs none of this.
 */
export const ModalNestingContext = createContext(false);

let holder: symbol | null = null;
/** When the last holder's dismissal is over (epoch ms). */
let freeAt = 0;
const waiting: Array<() => void> = [];
let retryTimer: ReturnType<typeof setTimeout> | null = null;

function grantNext() {
  if (holder || waiting.length === 0) return;
  const wait = freeAt - Date.now();
  if (wait > 0) {
    if (!retryTimer) {
      retryTimer = setTimeout(() => {
        retryTimer = null;
        grantNext();
      }, wait);
    }
    return;
  }
  waiting.shift()?.();
}

/**
 * Whether a root-level modal that wants to be shown may present now.
 * `dismissMs` is how long its own dismissal takes once it stops wanting to
 * show (its animation, or a beat for an unanimated one), during which the
 * next modal still waits.
 */
export function useModalTurn(wants: boolean, dismissMs: number): boolean {
  const nested = useContext(ModalNestingContext);
  const bypass = nested || Platform.OS !== 'ios';
  const id = useRef(Symbol('modal')).current;
  const [granted, setGranted] = useState(false);

  useEffect(() => {
    if (bypass || !wants) return;
    let active = true;
    const take = () => {
      if (!active) return;
      holder = id;
      setGranted(true);
    };
    if (!holder && Date.now() >= freeAt && waiting.length === 0) take();
    else {
      waiting.push(take);
      grantNext();
    }
    return () => {
      active = false;
      const queued = waiting.indexOf(take);
      if (queued >= 0) waiting.splice(queued, 1);
      if (holder === id) {
        holder = null;
        freeAt = Date.now() + dismissMs;
        setGranted(false);
        grantNext();
      }
    };
  }, [bypass, wants, id, dismissMs]);

  return bypass ? wants : wants && granted;
}
