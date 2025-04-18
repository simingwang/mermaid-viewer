import mermaid from "mermaid";
import panzoom, { PanZoom } from "panzoom";

export type SupportedKey = "text" | "sequence-number";

export class TextChangeEvent extends CustomEvent<{ text: string }> {
    constructor(text: string) {
        super("textChange", {
            detail: {
                text
            }
        });
    }
}

export class SequenceChangeEvent extends CustomEvent<{ sequenceNumber: number }> {
    constructor(sequenceNumber: number) {
        super("sequenceChange", {
            detail: {
                sequenceNumber
            }
        });
    }
}

export type MermaidEvent = TextChangeEvent | SequenceChangeEvent;
export type EventNameAndMermaidEventMapping = {
    textChange: TextChangeEvent;
    sequenceChange: SequenceChangeEvent;
};

// compress and decompress text using CompressionStream and DecompressionStream
// https://numb86-tech.hatenablog.com/entry/2023/01/22/171246
const compress = async (target: string): Promise<string> => {
    const arrayBufferToBinaryString = (arrayBuffer: ArrayBuffer): string => {
        const bytes = new Uint8Array(arrayBuffer);

        let binaryString = "";
        for (let i = 0; i < bytes.byteLength; i++) {
            binaryString += String.fromCharCode(bytes[i]);
        }

        return binaryString;
    };

    const blob = new Blob([target]);
    const stream = blob.stream();
    const compressedStream = stream.pipeThrough(
        new CompressionStream("deflate")
    );
    const buf = await new Response(compressedStream).arrayBuffer();
    const binaryString = arrayBufferToBinaryString(buf);
    const encodedByBase64 = btoa(binaryString);
    return encodedByBase64;
};

const decompress = async (target: string): Promise<string> => {
    const binaryStringToBytes = (str: string): Uint8Array => {
        const bytes = new Uint8Array(str.length);
        for (let i = 0; i < str.length; i++) {
            bytes[i] = str.charCodeAt(i);
        }
        return bytes;
    };
    const decodedByBase64 = atob(target);
    const bytes = binaryStringToBytes(decodedByBase64);
    const stream = new Blob([bytes]).stream();
    const decompressedStream = stream.pipeThrough(
        new DecompressionStream("deflate")
    );
    return await new Response(decompressedStream).text();
};


export const urlStorage = {
    // use hash for avoiding URL is too long 414 Request-URI Too Large
    // text is too long
    getText: async () => {
        const url = new URL(window.location.href);
        const value = url.hash.slice(1);
        if (value) {
            try {
                return await decompress(value);
            } catch {
                console.info("Fail to decompress and treat it as just urlencoded text");
                return decodeURIComponent(value);
            }
        }
        return null;
    },
    setText: async (value: string) => {
        // compress to avoid URL is too long 414 Request-URI Too Large
        window.history.replaceState({}, "", "#" + (await compress(value)));
    },
    get: (key: SupportedKey) => {
        const url = new URL(window.location.href);
        const value = url.searchParams.get(key);
        if (value) {
            return value;
        }
        return null;
    },
    set: (key: SupportedKey, value: string) => {
        const url = new URL(window.location.href);
        url.searchParams.set(key, value);
        window.history.replaceState({}, "", url.toString());
    }
};

/**
 * dispatch "change" event when text is changed
 */
export class MermaidController extends HTMLElement {
    static observedAttributes = ["text", "sequence-number", "dialog-open"];
    #inputDialogOpened = false;
    #target?: string;
    #inputDialog?: HTMLDialogElement;
    #inputDialogOpen?: HTMLButtonElement;
    #inputDialogClose?: HTMLButtonElement;
    #inputDialogInput?: HTMLTextAreaElement;
    #sequence?: {
        currentSequenceNumber: number;
        abortController: AbortController;
        sequenceController?: ReturnType<typeof MermaidController.prototype.createSequenceController>;
        sequenceNumber: HTMLSpanElement;
        sequenceStepper: HTMLInputElement;
        prevSequence: Element;
        nextSequence: Element;
        sequenceControllerElement: HTMLDivElement;
    };
    #pan?: PanZoom;
    #downloadButton?: HTMLButtonElement;

    async downloadAsPNG() {
        const svgElement = document.querySelector('#graphDiv').querySelector('svg');
        if (!svgElement) return;

        const svgData = new XMLSerializer().serializeToString(svgElement);
        
        // Create canvas and set dimensions
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        
        // Set canvas dimensions based on SVG viewBox or client size
        const viewBox = svgElement.getAttribute('viewBox');
        if (viewBox) {
            const [,, width, height] = viewBox.split(' ').map(Number);
            canvas.width = width;
            canvas.height = height;
        } else {
            canvas.width = svgElement.clientWidth;
            canvas.height = svgElement.clientHeight;
        }
        
        // Fill white background
        ctx.fillStyle = 'white';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        
        // Create Image and draw to canvas
        const img = new Image();
        img.onload = () => {
            ctx.drawImage(img, 0, 0);
            const link = document.createElement('a');
            link.download = 'diagram.png';
            link.href = canvas.toDataURL('image/png');
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        };
        img.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svgData)));
    }

    constructor() {
        super();
        // 添加下载按钮DOM
        this.#downloadButton = document.querySelector('#downloadBtn');
        this.#downloadButton?.addEventListener('click', () => this.downloadAsPNG());

        if (!this.shadowRoot) {
            return; // Do nothing if no shadow root
        }
        this.#inputDialog = this.shadowRoot.querySelector("#inputDialog")!;
        this.#inputDialogClose = this.shadowRoot.querySelector("#inputDialogClose")!;
        this.#inputDialogOpen = this.shadowRoot.querySelector("#openDialog")!;
        this.#inputDialogInput = this.shadowRoot.querySelector("#inputDialogInput")!;
        this.#inputDialogClose.addEventListener("click", () => {
            this.closeInputDialog();
        });
        this.#sequence = {
            currentSequenceNumber: 0,
            abortController: new AbortController(),
            sequenceControllerElement: this.shadowRoot.querySelector("#sequenceController")!,
            sequenceNumber: this.shadowRoot.querySelector("#sequenceNumberLabel")!,
            sequenceStepper: this.shadowRoot.querySelector("#sequenceStepper")!,
            nextSequence: this.shadowRoot.querySelector("#nextSequence")!,
            prevSequence: this.shadowRoot.querySelector("#prevSequence")!
        };
        this.shadowRoot.addEventListener(
            "mousedown",
            (event) => {
                if (!(event.target as HTMLElement).closest('#downloadBtn')) {
                    event.stopPropagation();
                }
            },
            {
                passive: false
            }
        );
        this.#inputDialog?.addEventListener(
            "wheel",
            (event) => {
                event.stopPropagation();
            },
            {
                passive: false
            }
        );
        this.#sequence.sequenceStepper.addEventListener(
            "keydown",
            (event) => {
                event.stopPropagation();
            },
            {
                passive: false
            }
        );
        this.#inputDialogInput.addEventListener(
            "keydown",
            (event) => {
                event.stopPropagation();
            },
            {
                passive: false
            }
        );
        this.shadowRoot.addEventListener(
            "touchstart",
            (event) => {
                event.stopPropagation();
            },
            {
                passive: false
            }
        );
        this.#inputDialogOpen.addEventListener("click", () => {
            this.openInputDialog();
        });
        const text = this.getAttribute("text");
        const startSequenceNumber = this.getAttribute("sequence-number") ?? "0";
        if (text) {
            this.render(text)
                .then(() => {
                    this.updateSequenceController();
                    this.updateSequenceNumber(Number(startSequenceNumber));
                })
                .catch((error) => {
                    console.error(error);
                    window.alert("Fail to render: " + error.message);
                });
        }
    }

    on = <T extends keyof EventNameAndMermaidEventMapping>(
        eventName: T,
        listener: (event: EventNameAndMermaidEventMapping[T]) => void
    ) => {
        this.addEventListener(eventName, listener as EventListener);
    };

    updateSequenceController() {
        const sequence = this.#sequence;
        if (!sequence) {
            throw new Error("sequenceController is not initialized");
        }
        const isSequenceDiagram = this.getAttribute("text")?.includes("sequenceDiagram") ?? false;
        sequence.sequenceControllerElement.style.display = isSequenceDiagram ? "flex" : "none";
        // remove event listener
        sequence.abortController.abort();
        sequence.abortController = new AbortController();
        // if sequence diagram
        const controller = this.createSequenceController();
        sequence.sequenceController = controller;
        sequence?.nextSequence.addEventListener("click", controller.moveNext, {
            signal: sequence?.abortController.signal
        });
        sequence?.prevSequence.addEventListener("click", controller.movePrev, {
            signal: sequence?.abortController.signal
        });
        // sequenceStepper
        sequence.sequenceStepper.max = String(controller.totalSequenceNumber);
        sequence.sequenceStepper.addEventListener(
            "input",
            (event) => {
                const seqNumber = Number((event.target as HTMLInputElement).value);
                controller.moveTo(seqNumber);
            },
            {
                signal: sequence?.abortController.signal
            }
        );
    }

    attributeChangedCallback(name: string, oldValue: string, newValue: string) {
        if (name === "text") {
            if (!newValue) {
                return;
            }
            this.render(newValue)
                .then(() => {
                    this.updateSequenceController();
                    this.updateSequenceNumber(0);
                    if (this.#inputDialogInput) {
                        this.#inputDialogInput.value = newValue;
                    }
                    this.dispatchEvent(new TextChangeEvent(newValue));
                })
                .catch((error) => {
                    console.error(error);
                    window.alert("Fail to render: " + error.message);
                });
        } else if (name === "sequence-number") {
            if (!newValue) {
                return;
            }
            this.onReadySqeuenceController().then((controller) => {
                controller?.moveTo(Number(newValue));
            });
        } else if (name === "dialog-open") {
            if (newValue === "true") {
                this.openInputDialog();
            } else {
                this.closeInputDialog();
            }
        }
    }

    async onReadySqeuenceController() {
        while (!this.#sequence?.sequenceController) {
            await new Promise<void>((resolve) => {
                setTimeout(() => {
                    resolve();
                }, 16);
            });
        }
        return this.#sequence?.sequenceController;
    }

    openInputDialog() {
        this.#inputDialogOpened = true;
        this.#inputDialog?.showModal();
        this.#inputDialogInput?.focus();
    }

    closeInputDialog() {
        this.#inputDialogOpened = false;
        this.#inputDialog?.close();
        this.setAttribute("text", this.#inputDialogInput?.value ?? "");
    }

    async render(text?: string) {
        if (!text) {
            return;
        }
        mermaid.initialize({
            startOnLoad: false,
            // may be option?
            sequence: {
                showSequenceNumbers: true
            }
        });
        if (this.#pan) {
            this.#pan.dispose();
        }
        const mySvgId = this.getAttribute("mySvgId") ?? "mySvgId";
        let graphDivId = this.getAttribute("target");
        if (!graphDivId) {
            graphDivId = "graphDiv";
        }
        const graphDiv = document.getElementById(graphDivId) as HTMLElement | undefined;
        if (!graphDiv) {
            throw new Error("Target element not found");
        }
        // clear graphDiv
        const { svg, bindFunctions } = await mermaid.render(mySvgId, text);
        graphDiv.innerHTML = svg.replace(/[ ]*max-width:[ 0-9\.]*px;/i, "");
        bindFunctions?.(graphDiv);
        this.#pan = panzoom(graphDiv);
        // wait for the graph to be rendered
        await new Promise<void>((resolve) => {
            setTimeout(() => {
                resolve();
            }, 200);
        });
    }

    async waitForRendered() {
        // graphDiv is not rendered yet loop until it is rendered
        let count = 0;
        const limit = 10;
        console.log(document.querySelector(`#${this.getAttribute("target")} .sequenceNumber`))
        while (!document.querySelector(`#${this.getAttribute("target")} .sequenceNumber`)) {
            console.log("qw")
            await new Promise<void>((resolve) => {
                setTimeout(() => {
                    resolve();
                }, 16);
            });
            count++;
        }
    }

    updateSequenceNumber = (seqNumber: number) => {
        if (!this.#sequence) {
            return;
        }
        if (!this.#sequence?.sequenceNumber) {
            return;
        }
        this.#sequence.currentSequenceNumber = seqNumber;
        this.#sequence.sequenceStepper.value = String(seqNumber);
        this.#sequence.sequenceNumber.textContent = String(seqNumber);
        this.dispatchEvent(new SequenceChangeEvent(seqNumber));
    };

    // sequenceDiagram
    createSequenceController() {
        type SequenceElement = {
            number: number;
            rect: DOMRect;
        };
        // width: 4
        const viewBox = document
            ?.querySelector("#graphDiv svg")
            ?.getAttribute("viewBox")
            ?.split(" ")
            .map((e) => Number(e));
        const viewBoxSize = {
            width: viewBox?.[2] ?? 0,
            height: viewBox?.[3] ?? 0
        };
        // pre-calculate all sequence element rects
        // smoothShowRectangle is affected by transform of parent element
        const allSequenceElementRects = Array.from(
            document.querySelectorAll(`#${this.getAttribute("target")} .sequenceNumber`)
        ).map((e) => {
            return {
                number: Number(e.textContent),
                rect: e.getBoundingClientRect()
            };
        });
        const totalSequenceNumber = allSequenceElementRects.length;
        let graphDivId = this.getAttribute("target");
        if (!graphDivId) {
            graphDivId = "graphDiv";
        }
        const getSequenceElement = (seqNumber: number) => {
            return allSequenceElementRects.find((e) => e.number === seqNumber);
        };
        const panElement = (target: SequenceElement) => {
            const pan = this.#pan;
            if (!pan) {
                return;
            }
            const rect = target.rect;
            // Padding is calculated by the following formula
            // viewPort 4500 -> padding: 150
            // viewPort 4000 → padding: 200
            // viewPort 3000 → padding: 300
            // viewPort 2000 → padding: 400
            // viewPort 1000 → padding: 500
            // y = -1/5x + 700
            // limit: 100 <= padding <= 600
            const calcPaddingBlock = -1 / 5 * viewBoxSize.height + 700;
            const calcPaddingInline = -1 / 5 * viewBoxSize.width + 700;
            const rectanglePaddingBlock = Math.max(100, Math.min(600, calcPaddingBlock));
            const rectanglePaddingInline = Math.max(100, Math.min(600, calcPaddingInline));
            console.debug("Padding Calculation Results", {
                viewBoxSize,
                calcPaddingBlock,
                calcPaddingInline,
                rectanglePaddingBlock,
                rectanglePaddingInline
            })
            // target.scrollIntoView({ behavior: "smooth", block: "center", inline: "center" })
            // https://github.com/anvaka/panzoom/issues/219
            pan.smoothShowRectangle(
                {
                    ...rect.toJSON(),
                    // TODO: need to configurable or calculate from parent element
                    left: rect.left - rectanglePaddingInline,
                    top: rect.top - rectanglePaddingBlock,
                    right: rect.right + rectanglePaddingInline,
                    bottom: rect.bottom + rectanglePaddingBlock
                },
                (from, to) => {
                    const distance = Math.sqrt(
                        Math.pow(from.top - to.top, 2) +
                        Math.pow(from.right - to.right, 2) +
                        Math.pow(from.bottom - to.bottom, 2) +
                        Math.pow(from.left - to.left, 2)
                    );
                    const exp_diff = Math.exp(distance / 1000);
                    const sigmoid = (exp_diff * 1000) / (exp_diff + 1);

                    return sigmoid;
                }
            );
        };
        return {
            totalSequenceNumber,
            moveTo: (seqNumber: number) => {
                const currentSequenceElement = getSequenceElement(seqNumber);
                if (!currentSequenceElement) {
                    return;
                }
                panElement(currentSequenceElement);
                this.updateSequenceNumber(seqNumber);
            },
            moveNext: () => {
                const currentNumber = this.#sequence?.currentSequenceNumber ?? 0;
                const moveToNumber = Math.max(0, currentNumber + 1);
                const currentSequenceElement = getSequenceElement(moveToNumber);
                if (!currentSequenceElement) {
                    this.#pan?.smoothShowRectangle
                    return;
                }
                panElement(currentSequenceElement);
                this.updateSequenceNumber(moveToNumber);
            },
            movePrev: () => {
                const currentNumber = this.#sequence?.currentSequenceNumber ?? 0;
                const moveToNumber = Math.max(0, currentNumber - 1);
                if (moveToNumber === 0) {
                    // reset zoom
                    this.#pan?.smoothZoomAbs(0, 0, 1);
                    this.updateSequenceNumber(0)
                    return;
                }
                const currentSequenceElement = getSequenceElement(moveToNumber);
                if (!currentSequenceElement) {
                    return;
                }
                panElement(currentSequenceElement);
                this.updateSequenceNumber(moveToNumber);
            }
        };
    }
}
