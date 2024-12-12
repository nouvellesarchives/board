//@ts-check
//@ts-ignore
import { Sortable } from 'sortablejs'
//@ts-ignore
import { fileSave, fileOpen } from "browserFsAccess"

class ImageProcessor {
  constructor(maxWidth = 500) {
    this.maxWidth = maxWidth;
  }

  async render(blob) {
    return new Promise((resolve, reject) => {
      const image = new Image();
      const url = URL.createObjectURL(blob);

      image.onload = () => {
        URL.revokeObjectURL(url);

        const canvas = new OffscreenCanvas(this.maxWidth, this.maxWidth);
        const context = canvas.getContext('2d');

        // Calculate the aspect ratio and fit the image
        const { width, height, ar } = this.calculateAspectRatioFit(image.width, image.height);

        canvas.width = width;
        canvas.height = height;

        // Draw the image onto the canvas
        context?.drawImage(image, 0, 0, width, height);

        // Return the compressed image as a blob
        canvas.convertToBlob({ type: 'image/webp', quality: 0.8 })
          .then((compressedBlob) => {
            resolve({ out: compressedBlob, ar });
          })
          .catch(reject);
      };

      image.onerror = (err) => {
        URL.revokeObjectURL(url);
        reject(err);
      };

      image.src = url;
    });
  }

  calculateAspectRatioFit(srcWidth, srcHeight) {
    const ar = srcWidth / srcHeight;
    const ratio = Math.min(this.maxWidth / srcWidth, this.maxWidth / srcHeight);
    const width = Math.round(srcWidth * ratio);
    const height = Math.round(srcHeight * ratio);

    return {
      width,
      height,
      ar: this.formatAspectRatio(ar),
    };
  }

  formatAspectRatio(ar) {
    // Format the aspect ratio as 'width:height'
    const gcd = this.greatestCommonDivisor(ar * 1000, 1000); // Approximate to avoid floating point issues
    return `${Math.round(ar * 1000 / gcd)}:${Math.round(1000 / gcd)}`;
  }

  greatestCommonDivisor(a, b) {
    while (b) {
      const temp = b;
      b = a % b;
      a = temp;
    }
    return a;
  }
}

const reduce = new ImageProcessor(500);
let selectionMode = false
let selection = []
let board = []
let currentBoard = {
  title: "untitled",
  path: "",
  saved: false,
  lastSave: []
}

function deleteSelection() {
  selection.forEach((s) => {
    const el = document.getElementById(s);
    el?.remove()
  })
}


function shuffle(c) {
  board.sort(() => Math.random() - 0.5);
  c.innerHTML = ""
  board.forEach((e) => {
    const gridItem = document.createElement('li');
    gridItem.setAttribute('data-selected', 'false')
    gridItem.id = e.id
    gridItem.addEventListener('click', (e) => {
      if (!selectionMode) { return }
      const isSelected = e.target?.getAttribute('data-selected') === 'true'
      console.log(isSelected)
      if (isSelected) {
        e.target?.setAttribute('data-selected', false)
      } else {
        e.target?.setAttribute('data-selected', true)
        selection.push(e.target?.id)
      }
    })
    const img = document.createElement('img');
    img.src = e.data;
    img.setAttribute('data-porta', e.isPortrait)
    img.addEventListener('dragstart', (e) => e.preventDefault());
    gridItem.appendChild(img);
    c?.appendChild(gridItem);
  });

  updateBoard();
  updateBoardMeta(currentBoard.title, false)
}

async function saveBoard() {
  console.log("board", board.length)
  const str = JSON.stringify(board);
  const blob = new Blob([str], { type: 'application/octet-stream' });

  const now = new Date().toISOString().slice(0, 10);

  console.log(board)
  if (blob) {
    await fileSave(blob, {
      fileName: currentBoard.title === "untitled" ? "untitled" + "-" + now + ".board" : currentBoard.title + ".board",
      extensions: [".board"]
    })

    updateBoardMeta(currentBoard.title, true)
    currentBoard.lastSave = board
  }
}


/**
 * @param {*} title 
 * @param {*} saved 
 */
function updateBoardMeta(title, saved) {
  const n = document.getElementById("board-title");
  // @ts-ignore
  n.value = title
  // @ts-ignore
  if (safari) { n.style.width = (title.length * 0.38) + "rem" }
  currentBoard.title = title
  const s = document.querySelector('[data-saved]');
  s?.setAttribute('data-saved', saved);
  currentBoard.saved = saved
}

function updateBoard() {
  board.length = 0;
  const gridItems = document.querySelectorAll('#grid li');
  gridItems.forEach(el => {
    const id = el.id;
    const img = el.querySelector('img');
    board.push({
      id: id,
      isPortrait: img?.dataset.porta === "true",
      data: img?.src
    });
    updateBoardMeta(currentBoard.title, false);
  });
}

/**
 * @param {HTMLElement | null} c 
 */
async function loadImages(c) {
  try {
    const images = await fileOpen({
      mimeTypes: ['image/*'],
      description: "Insert images",
      multiple: true,
      id: 'images',
      excludeAcceptAllOption: true,
    })

    images.forEach(async (i) => {
      const blob = new Blob([await i.arrayBuffer()], { type: i.type });
      reduce.render(blob)
        .then(({ out, ar }) => {
          const reader = new FileReader();

          const isPortrait = ar.includes(':')
            && parseInt(ar.split(':')[0]) < parseInt(ar.split(':')[1]);
          console.log('is portrait:', isPortrait);

          const id = genID()

          reader.onload = function (event) {
            const gridItem = document.createElement('li');
            gridItem.setAttribute('data-selected', 'false')
            gridItem.id = id
            gridItem.addEventListener('click', (e) => {
              if (!selectionMode) { return }
              const isSelected = e.target?.getAttribute('data-selected') === 'true'
              console.log(isSelected)
              if (isSelected) {
                e.target?.setAttribute('data-selected', false)
              } else {
                e.target?.setAttribute('data-selected', true)
                selection.push(e.target?.id)
              }
            })
            const img = document.createElement('img');
            img.src = event.target?.result?.toString() || "";
            img.setAttribute('data-porta', isPortrait)
            img.addEventListener('dragstart', (e) => e.preventDefault());
            gridItem.appendChild(img);
            c?.insertBefore(gridItem, c.firstChild);
          };

          updateBoard();
          reader.readAsDataURL(out);
        })
        .catch((err) => {
          console.error('Error during image compression:', err);
        });
    });
  } catch (err) {
    console.error('Error opening the board:', err);
  }
}

/**
 * @param {HTMLElement | null} c 
 */
async function openBoard(c) {
  try {
    const file = await fileOpen({
      extensions: [".board"],
      description: "Boards",
      id: 'boards',
    })
    const buf = await file.arrayBuffer();
    const str = new TextDecoder().decode(buf)
    const data = JSON.parse(str);

    if (c) {
      //@ts-ignore
      c.innerHTML = ""
    }

    data.forEach((e) => {
      const gridItem = document.createElement('li');
      gridItem.setAttribute('data-selected', 'false')
      gridItem.id = e.id
      gridItem.addEventListener('click', (e) => {
        if (!selectionMode) { return }
        const isSelected = e.target?.getAttribute('data-selected') === 'true'
        console.log(isSelected)
        if (isSelected) {
          e.target?.setAttribute('data-selected', false)
        } else {
          e.target?.setAttribute('data-selected', true)
          selection.push(e.target?.id)
        }
      })
      const img = document.createElement('img');
      img.src = e.data;
      img.setAttribute('data-porta', e.isPortrait)
      img.addEventListener('dragstart', (e) => e.preventDefault());
      gridItem.appendChild(img);
      c?.appendChild(gridItem);
    });

    updateBoard();
    updateBoardMeta(file.name.split('.')[0], true)
    currentBoard.lastSave = board
  } catch (err) {
    console.error('Error opening the board:', err);
  }
}

let dark;

function toggleLight() {
  dark = !dark
  document?.body.classList.toggle('dark')
  window.localStorage.setItem('theme-dark', String(dark))
}

async function isSafari() {
  if (navigator.userAgentData) {
    const brands = await navigator.userAgentData.getHighEntropyValues(['brands']);
    return brands.brands.some(brand => brand.brand === "Safari" && !brands.brands.some(b => b.brand === "Chrome"));
  } else {
    // Fallback for browsers without `userAgentData`
    const ua = navigator.userAgent;
    return /Safari/.test(ua) && !/Chrome/.test(ua) && !/CriOS/.test(ua);
  }
}

let safari;

document.addEventListener('DOMContentLoaded', async () => {
  const gridContainer = document.getElementById('grid');
  dark = window.localStorage.getItem('theme-dark')
  console.log(dark)
  if (!dark) {
    window.localStorage.setItem('theme-dark', "false")
  }
  dark = dark === "true"
  if (!dark) { document.body.classList.remove('dark') }
  safari = await isSafari()

  if (safari) { updateBoardMeta(currentBoard.title, true) }

  const bt = document.getElementById("board-title");
  bt?.addEventListener('input', (e) => {
    // @ts-ignore
    const value = e.target.value
    currentBoard.title = value
    if (safari) { bt.style.width = (value.length * 0.38) + "rem" }
  })

  document.addEventListener('keydown', (event) => {
    if ((event.metaKey || event.ctrlKey) && event.altKey && event.code === 'KeyS') {
      event.preventDefault()
      selectionMode = !selectionMode
      gridContainer?.setAttribute('data-mode-selection', selectionMode.toString())
      if (!selectionMode && selection.length > 0) {
        selection.forEach((s) => {
          document.getElementById(s)?.setAttribute('data-selected', 'false')
        })
        selection.length = 0
      }
    } else if ((event.metaKey || event.ctrlKey) && event.code === 'KeyK') {
      event.preventDefault()
      if (!selectionMode || selection.length === 0) { return }
      deleteSelection()
      selectionMode = !selectionMode
      gridContainer?.setAttribute('data-mode-selection', selectionMode.toString())
      updateBoard();
    } else if (event.ctrlKey && event.code === 'KeyS') {
      event.preventDefault()
      saveBoard();
    } else if (event.ctrlKey && event.code == "KeyO") {
      event.preventDefault()
      openBoard(gridContainer)
    } else if (event.ctrlKey && event.code == "KeyL") {
      event.preventDefault()
      toggleLight();
    }
    if (event.ctrlKey && event.code === "KeyN") {
      event.preventDefault()
      shuffle(gridContainer);
    }
  });

  new Sortable(gridContainer, {
    filter: '.selection',
    animation: 150,
    ghostClass: 'dragging',
    onEnd: () => {
      updateBoard()
    },
  });

  function checkClip(event) {
    const items = (event.clipboardData || event.originalEvent.clipboardData)?.items;

    if (!items) return;

    for (const item of items) {
      if (item.kind === 'file' && item.type.startsWith('image/')) {
        console.log('Image detected on clipboard');
        return true;
      }
    }

    console.log('No images found on clipboard');
    return false;
  }

  document.addEventListener('paste', (event) => {
    //@ts-ignore
    const items = (event.clipboardData || event.originalEvent.clipboardData).items;
    if (!checkClip(event)) { loadImages(gridContainer); }
    for (let index in items) {
      const item = items[index];
      if (item.kind === 'file' && item.type.startsWith('image/')) {
        const blob = item.getAsFile();
        reduce.render(blob)
          .then(({ out, ar }) => {
            const reader = new FileReader();

            const isPortrait = ar.includes(':')
              && parseInt(ar.split(':')[0]) < parseInt(ar.split(':')[1]);
            console.log('is portrait:', isPortrait);

            const id = genID()

            reader.onload = function (event) {
              const gridItem = document.createElement('li');
              gridItem.setAttribute('data-selected', 'false')
              gridItem.id = id
              gridItem.addEventListener('click', (e) => {
                if (!selectionMode) { return }
                const isSelected = e.target?.getAttribute('data-selected') === 'true'
                console.log(isSelected)
                if (isSelected) {
                  e.target?.setAttribute('data-selected', false)
                } else {
                  e.target?.setAttribute('data-selected', true)
                  selection.push(e.target?.id)
                }
              })
              const img = document.createElement('img');
              img.src = event.target?.result?.toString() || "";
              img.setAttribute('data-porta', isPortrait)
              img.addEventListener('dragstart', (e) => e.preventDefault());
              gridItem.appendChild(img);
              gridContainer?.insertBefore(gridItem, gridContainer.firstChild);
            };

            updateBoard();
            reader.readAsDataURL(out);
          })
          .catch((err) => {
            console.error('Error during image compression:', err);
          });
      }
    }
  });
});

function genID() {
  const timestamp = Date.now().toString(36); // Convert current timestamp to base-36
  const randomValue = Math.random().toString(36).slice(2, 7); // Generate a random base-36 string of length 5
  return timestamp + randomValue; // Concatenate timestamp and random part
}
