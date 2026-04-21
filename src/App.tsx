import { useState, useRef, useEffect, useCallback } from 'react';
import './App.scss';

interface Letter {
  id: string;
  char: string;
  selected: boolean;
}

interface Sentence {
  id: string;
  letters: Letter[];
}

const uid = () => Math.random().toString(36).slice(2, 9);

export const App = () => {
  const [inputValue, setInputValue] = useState('');
  const [sentences, setSentences] = useState<Sentence[]>([]);
  const rootRef = useRef<HTMLDivElement>(null);
  const ghostRef = useRef<HTMLDivElement>(null);
  const dragState = useRef<{
    active: boolean;
    fromSIdx: number;
    startX: number;
    startY: number;
  } | null>(null);
  const dropInfo = useRef<{
    sIdx: number;
    lIdx: number | null;
    before: boolean;
  } | null>(null);
  const dropIndicatorRef = useRef<HTMLDivElement>(null);
  const selRect = useRef<{
    active: boolean;
    x0: number;
    y0: number;
    sIdx: number;
    sentEl: HTMLElement;
  } | null>(null);
  const selRectElRef = useRef<HTMLDivElement>(null);

  const addSentence = () => {
    if (!inputValue.trim()) {
      return;
    }

    setSentences(prev => [
      {
        id: uid(),
        letters: inputValue.split('').map(char => ({
          id: uid(),
          char: char,
          selected: false,
        })),
      },
      ...prev,
    ]);
    setInputValue('');
  };

  const clearAll = () => setSentences([]);

  const getSentenceEl = (element: Element | null): HTMLElement | null => {
    let current = element;

    while (current && !current.classList.contains('sentence')) {
      current = current.parentElement;
    }

    return current as HTMLElement | null;
  };

  const removeDropIndicator = () => {
    if (dropIndicatorRef.current) {
      dropIndicatorRef.current.style.display = 'none';
    }
  };

  const showDropIndicator = (
    xPosition: number,
    sentenceElement: HTMLElement,
  ) => {
    const rootRect = rootRef.current!.getBoundingClientRect();
    const sentenceRect = sentenceElement.getBoundingClientRect();
    const indicator = dropIndicatorRef.current!;

    indicator.style.display = 'block';
    indicator.style.left = xPosition - rootRect.left - 1 + 'px';
    indicator.style.top = sentenceRect.top - rootRect.top + 6 + 'px';
    indicator.style.height = sentenceRect.height - 12 + 'px';
  };

  const onDragMove = useCallback((event: MouseEvent) => {
    if (!dragState.current) {
      return;
    }

    const deltaX = event.clientX - dragState.current.startX;
    const deltaY = event.clientY - dragState.current.startY;

    if (
      dragState.current.active === false &&
      Math.sqrt(deltaX * deltaX + deltaY * deltaY) < 5
    ) {
      return;
    }

    if (!dragState.current.active) {
      dragState.current.active = true;
      setSentences(prev => {
        const chars = prev[dragState.current!.fromSIdx].letters
          .filter(letter => letter.selected)
          .map(letter => (letter.char === ' ' ? '\u00A0' : letter.char))
          .join('');

        ghostRef.current!.textContent = chars;
        ghostRef.current!.style.display = 'block';

        return prev;
      });
    }

    const rootRect = rootRef.current!.getBoundingClientRect();

    ghostRef.current!.style.left = event.clientX - rootRect.left + 12 + 'px';
    ghostRef.current!.style.top = event.clientY - rootRect.top - 20 + 'px';

    removeDropIndicator();
    const elementUnderCursor = document.elementFromPoint(
      event.clientX,
      event.clientY,
    ) as HTMLElement;
    const sentenceElement = getSentenceEl(elementUnderCursor);

    if (!sentenceElement) {
      return;
    }

    const targetSentenceIndex = parseInt(sentenceElement.dataset.sidx!);
    const letterElements = [
      ...sentenceElement.querySelectorAll<HTMLElement>(
        '.letter:not(.dragging-ghost)',
      ),
    ];

    if (letterElements.length === 0) {
      dropInfo.current = {
        sIdx: targetSentenceIndex,
        lIdx: null,
        before: true,
      };
      const sentenceRect = sentenceElement.getBoundingClientRect();

      showDropIndicator(sentenceRect.left + 8, sentenceElement);

      return;
    }

    let bestMatch: {
      lIdx: number;
      before: boolean;
      x: number;
      el: HTMLElement;
    } | null = null;
    let bestDistance = Infinity;

    letterElements.forEach(span => {
      const spanRect = span.getBoundingClientRect();
      const isBefore = event.clientX < spanRect.left + spanRect.width / 2;
      const edgeX = isBefore ? spanRect.left : spanRect.right;
      const distance = Math.abs(event.clientX - edgeX);

      if (distance < bestDistance) {
        bestDistance = distance;
        bestMatch = {
          lIdx: parseInt(span.dataset.lidx!),
          before: isBefore,
          x: edgeX,
          el: span,
        };
      }
    });

    if (bestMatch) {
      dropInfo.current = {
        sIdx: targetSentenceIndex,
        lIdx: bestMatch!.lIdx,
        before: bestMatch!.before,
      };
      showDropIndicator(bestMatch!.x, sentenceElement);
    }
  }, []);

  const onDragEnd = useCallback(() => {
    document.removeEventListener('mousemove', onDragMove);
    document.removeEventListener('mouseup', onDragEnd);
    ghostRef.current!.style.display = 'none';
    removeDropIndicator();

    if (!dragState.current?.active) {
      dragState.current = null;

      return;
    }

    const fromSentenceIndex = dragState.current.fromSIdx;

    dragState.current = null;
    if (!dropInfo.current) {
      return;
    }

    const { sIdx: toSentenceIndex, lIdx: toLetterIndex } = dropInfo.current;

    dropInfo.current = null;

    setSentences(prev => {
      const next = prev.map(sentence => ({
        ...sentence,
        letters: sentence.letters.map(letter => ({ ...letter })),
      }));

      const selectedIndices = next[fromSentenceIndex].letters
        .map((letter, index) => (letter.selected ? index : -1))
        .filter(index => index !== -1);

      if (selectedIndices.length === 0 || toLetterIndex === null) {
        return prev;
      }

      if (fromSentenceIndex === toSentenceIndex) {
        const letters = next[fromSentenceIndex].letters;

        if (selectedIndices.includes(toLetterIndex)) {
          return prev;
        }

        const movingRight =
          toLetterIndex > selectedIndices[selectedIndices.length - 1];
        const swapTargets = movingRight
          ? letters
              .map((letter, index) =>
                !letter.selected &&
                index > selectedIndices[selectedIndices.length - 1] &&
                index <= toLetterIndex
                  ? index
                  : -1,
              )
              .filter(index => index !== -1)
              .slice(-selectedIndices.length)
          : letters
              .map((letter, index) =>
                !letter.selected &&
                index >= toLetterIndex &&
                index < selectedIndices[0]
                  ? index
                  : -1,
              )
              .filter(index => index !== -1)
              .slice(0, selectedIndices.length);

        selectedIndices.forEach((selectedIndex, rank) => {
          if (swapTargets[rank] === undefined) {
            return;
          }

          const temp = letters[selectedIndex];

          letters[selectedIndex] = letters[swapTargets[rank]];
          letters[swapTargets[rank]] = temp;
        });
      } else {
        const fromLetters = next[fromSentenceIndex].letters;
        const toLetters = next[toSentenceIndex].letters;
        const count = selectedIndices.length;
        const targetIndices = Array.from(
          { length: count },
          (_, rank) => toLetterIndex + rank,
        ).filter(index => index < toLetters.length);

        selectedIndices.forEach((selectedIndex, rank) => {
          if (targetIndices[rank] === undefined) {
            return;
          }

          const temp = fromLetters[selectedIndex];

          fromLetters[selectedIndex] = {
            ...toLetters[targetIndices[rank]],
            selected: false,
          };
          toLetters[targetIndices[rank]] = { ...temp, selected: false };
        });
      }

      return next;
    });
  }, []);

  const onSelMove = useCallback((event: MouseEvent) => {
    if (!selRect.current?.active) {
      return;
    }

    const { x0, y0, sIdx, sentEl } = selRect.current;
    const x1 = Math.min(x0, event.clientX);
    const y1 = Math.min(y0, event.clientY);
    const x2 = Math.max(x0, event.clientX);
    const y2 = Math.max(y0, event.clientY);

    if (Math.abs(x2 - x1) < 4 && Math.abs(y2 - y1) < 4) {
      return;
    }

    const rootRect = rootRef.current!.getBoundingClientRect();
    const selectionBox = selRectElRef.current!;

    selectionBox.style.display = 'block';
    selectionBox.style.left = x1 - rootRect.left + 'px';
    selectionBox.style.top = y1 - rootRect.top + 'px';
    selectionBox.style.width = x2 - x1 + 'px';
    selectionBox.style.height = y2 - y1 + 'px';

    sentEl.querySelectorAll<HTMLElement>('.letter').forEach(span => {
      const spanRect = span.getBoundingClientRect();
      const centerX = spanRect.left + spanRect.width / 2;
      const centerY = spanRect.top + spanRect.height / 2;
      const isInside =
        centerX >= x1 && centerX <= x2 && centerY >= y1 && centerY <= y2;

      span.classList.toggle('selected', isInside);
      setSentences(prev => {
        const next = prev.map(sentence => ({
          ...sentence,
          letters: sentence.letters.map(letter => ({ ...letter })),
        }));

        next[sIdx].letters[parseInt(span.dataset.lidx!)].selected = isInside;

        return next;
      });
    });
  }, []);

  const onSelEnd = useCallback((event: MouseEvent) => {
    if (!selRect.current) {
      return;
    }

    selRect.current.active = false;
    selRectElRef.current!.style.display = 'none';
    document.removeEventListener('mousemove', onSelMove);
    document.removeEventListener('mouseup', onSelEnd);
    const sentenceIndex = selRect.current.sIdx;

    setSentences(prev => {
      const anySelected = prev[sentenceIndex]?.letters.some(
        letter => letter.selected,
      );

      if (anySelected) {
        dragState.current = {
          active: false,
          fromSIdx: sentenceIndex,
          startX: event.clientX,
          startY: event.clientY,
        };
        document.addEventListener('mousemove', onDragMove);
        document.addEventListener('mouseup', onDragEnd);
      }

      return prev;
    });
  }, []);

  const onMouseDown = useCallback((event: MouseEvent) => {
    if (event.button !== 0) {
      return;
    }

    const target = event.target as HTMLElement;
    const isLetter = target.classList.contains('letter');
    const sentenceElement = getSentenceEl(target);

    if (!sentenceElement) {
      return;
    }

    const sentenceIndex = parseInt(sentenceElement.dataset.sidx!);

    if (isLetter) {
      const letterIndex = parseInt(target.dataset.lidx!);

      if (event.ctrlKey || event.metaKey) {
        setSentences(prev => {
          const next = prev.map(sentence => ({
            ...sentence,
            letters: sentence.letters.map(letter => ({ ...letter })),
          }));

          next[sentenceIndex].letters[letterIndex].selected =
            !next[sentenceIndex].letters[letterIndex].selected;

          return next;
        });
      }

      dragState.current = {
        active: false,
        fromSIdx: sentenceIndex,
        startX: event.clientX,
        startY: event.clientY,
      };
      document.addEventListener('mousemove', onDragMove);
      document.addEventListener('mouseup', onDragEnd);
      event.preventDefault();
    } else {
      setSentences(prev =>
        prev.map(sentence => ({
          ...sentence,
          letters: sentence.letters.map(letter => ({
            ...letter,
            selected: false,
          })),
        })),
      );
      selRect.current = {
        active: true,
        x0: event.clientX,
        y0: event.clientY,
        sIdx: sentenceIndex,
        sentEl: sentenceElement,
      };
      selRectElRef.current!.style.display = 'none';
      document.addEventListener('mousemove', onSelMove);
      document.addEventListener('mouseup', onSelEnd);
      event.preventDefault();
    }
  }, []);

  useEffect(() => {
    const container = rootRef.current;

    if (!container) {
      return;
    }

    container.addEventListener('mousedown', onMouseDown);

    return () => container.removeEventListener('mousedown', onMouseDown);
  }, [onMouseDown]);

  return (
    <div
      className="container"
      ref={rootRef}
      style={{ position: 'relative', userSelect: 'none' }}
    >
      <div className="input-form">
        <textarea
          value={inputValue}
          onChange={event => setInputValue(event.target.value)}
          onKeyDown={event => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault();
              addSentence();
            }
          }}
          placeholder="Введіть текст..."
          rows={2}
        />
        <button onClick={addSentence}>Відобразити</button>
      </div>

      <div className="result-display">
        {sentences.map((sentence, sentenceIndex) => (
          <div key={sentence.id} className="sentence" data-sidx={sentenceIndex}>
            {sentence.letters.map((letter, letterIndex) => (
              <span
                key={letter.id}
                className={`letter${letter.selected ? ' selected' : ''}`}
                data-sidx={sentenceIndex}
                data-lidx={letterIndex}
                style={{ color: letter.selected ? 'red' : 'inherit' }}
              >
                {letter.char === ' ' ? '\u00A0' : letter.char}
              </span>
            ))}
          </div>
        ))}
      </div>

      {sentences.length > 0 && (
        <button className="clear-btn" onClick={clearAll}>
          Видалити все
        </button>
      )}

      <div ref={selRectElRef} className="rect-element" />
      <div ref={ghostRef} className="dragging-ghost" />
      <div ref={dropIndicatorRef} className="drop-indicator" />
    </div>
  );
};
