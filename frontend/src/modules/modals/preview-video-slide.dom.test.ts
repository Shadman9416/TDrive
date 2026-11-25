import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    acquire: vi.fn(),
    mobile: vi.fn(() => false),
    notify: vi.fn(),
    download: vi.fn(),
    external: vi.fn(),
    password: vi.fn(),
    release: vi.fn(),
    close: vi.fn(),
    openOriginal: vi.fn(),
    setGalleryActive: vi.fn(),
    reserveOriginal: vi.fn(),
    releaseOriginalBudget: vi.fn(),
    renderInfo: vi.fn(() => ''),
    readExif: vi.fn(async () => ({})),
    resetListener: undefined as undefined | (() => void),
    policyListener: undefined as undefined | ((policy: { backgrounded: boolean }) => void),
}));
vi.mock('../../api', () => ({ closeMedia: mocks.close, isAndroidPlatform: () => false, isMobilePlatform: mocks.mobile, onRuntimeEvent: () => () => {}, openExternalUrl: mocks.external, openOriginalImage: mocks.openOriginal, requireOperationSuccess: vi.fn(), useEncryptionPassword: mocks.password }));
vi.mock('../renditions/runtime', () => ({ acquireRendition: mocks.acquire, subscribeRenditionReset: (listener: () => void) => { mocks.resetListener = listener; return () => {}; } }));
vi.mock('../gallery-policy', () => ({
    acquireOriginalViewerBudget: mocks.reserveOriginal,
    subscribeGalleryPolicy: (listener: (policy: { backgrounded: boolean }) => void) => { mocks.policyListener = listener; return () => {}; },
}));
vi.mock('../../ui/gallery/gallery-controller', () => ({ setActive: mocks.setGalleryActive }));
vi.mock('../notifications', () => ({ notify: mocks.notify }));
vi.mock('../encryption', () => ({ loadEncryptionStatus: vi.fn() }));
vi.mock('../transfers', () => ({ enqueueDownload: mocks.download }));
vi.mock('./preview-info', () => ({ renderImageInfoHTML: mocks.renderInfo }));
vi.mock('../exif', () => ({ readExif: mocks.readExif }));
vi.mock('./preview-transition', () => ({ capturePreviewTransitionSource: () => null, createPreviewTransitionController: () => ({ cancel: vi.fn(), isRunning: () => false, finishOpen: () => false, beginOpen: () => false, playClose: vi.fn() }) }));

const photoItem = { type: 'file' as const, id: 1, name: 'Photo.jpg', channel_id: 10, content_revision: 2 };
const videoItem = { type: 'file' as const, id: 2, name: 'clip.mp4', channel_id: 10, content_revision: 3 };

beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mocks.mobile.mockReturnValue(false);
    mocks.resetListener = undefined;
    mocks.policyListener = undefined;
    mocks.reserveOriginal.mockImplementation(() => mocks.releaseOriginalBudget);
    mocks.acquire.mockImplementation(() => ({ promise: Promise.resolve({ url: 'blob:photo', width: 1200, height: 800 }), release: mocks.release }));
    mocks.openOriginal.mockResolvedValue({ token: 'original-1', url: 'http://127.0.0.1/media/original-1', kind: 'image' });
    Object.defineProperty(HTMLImageElement.prototype, 'decode', { configurable: true, value: vi.fn(async () => {}) });
    document.body.innerHTML = '<div id="preview-modal" class="modal-overlay" style="display:none"><div id="preview-shell"><div id="preview-stage"><img id="preview-thumbnail"><img id="preview-image"><button id="preview-play" hidden></button><div id="preview-loading"><div id="preview-loading-fill"></div></div><div id="preview-error"></div><div id="preview-locked" style="display:none"><input id="preview-locked-input" type="password"><button id="preview-locked-eye"></button><button id="preview-locked-unlock"></button><div id="preview-locked-error"></div><div id="preview-locked-hint"><span id="preview-locked-hint-text"></span></div></div></div><span id="preview-filename"></span><button id="preview-download"></button><button id="preview-close"></button><button id="preview-prev"></button><button id="preview-next"></button><span id="preview-counter"></span><button id="preview-info-btn"></button><aside id="preview-info"><button id="preview-info-close"></button><div id="preview-info-body"></div></aside></div></div>';
});

afterEach(async () => {
    (await import('./preview')).teardownPreviewModal();
    vi.useRealTimers();
});

describe('photo viewer video slides', () => {
    it('video item shows play button and never opens an original', async () => {
        const preview = await import('./preview');
        const source = { getNeighbor: vi.fn(async () => null), playVideo: vi.fn() };
        preview.activatePreviewModal();
        await preview.openPreviewSource(source, videoItem);

        const playButton = document.getElementById('preview-play') as HTMLButtonElement;
        expect(playButton.hidden).toBe(false);
        expect(document.getElementById('preview-modal')?.classList.contains('is-video-slide')).toBe(true);
        expect(document.getElementById('preview-loading')?.style.display).toBe('none');
        expect(mocks.openOriginal).not.toHaveBeenCalled();
        expect(mocks.reserveOriginal).not.toHaveBeenCalled();
    });

    it('photo item hides the play button', async () => {
        const preview = await import('./preview');
        const source = { getNeighbor: vi.fn(async () => null), playVideo: vi.fn() };
        preview.activatePreviewModal();
        await preview.openPreviewSource(source, photoItem);

        const playButton = document.getElementById('preview-play') as HTMLButtonElement;
        expect(playButton.hidden).toBe(true);
        expect(document.getElementById('preview-modal')?.classList.contains('is-video-slide')).toBe(false);
    });

    it('play button calls source.playVideo with the active item', async () => {
        const preview = await import('./preview');
        const playVideo = vi.fn();
        const source = { getNeighbor: vi.fn(async () => null), playVideo };
        preview.activatePreviewModal();
        await preview.openPreviewSource(source, videoItem);

        document.getElementById('preview-play')!.click();
        expect(playVideo).toHaveBeenCalledExactlyOnceWith(videoItem);
    });

    it('video without a thumbnail still shows the play button', async () => {
        mocks.acquire.mockReturnValue({ promise: Promise.reject(new Error('missing thumbnail')), release: mocks.release });
        const preview = await import('./preview');
        const source = { getNeighbor: vi.fn(async () => null), playVideo: vi.fn() };
        preview.activatePreviewModal();
        await expect(preview.openPreviewSource(source, videoItem)).resolves.toBe(true);
        await Promise.resolve();

        const playButton = document.getElementById('preview-play') as HTMLButtonElement;
        expect(playButton.hidden).toBe(false);
        expect(document.getElementById('preview-error')?.textContent).toBe('');
        expect(mocks.openOriginal).not.toHaveBeenCalled();
    });

    it('moving from a video slide to a photo hides the button and loads the original', async () => {
        const preview = await import('./preview');
        const source = {
            getNeighbor: vi.fn(async () => photoItem),
            playVideo: vi.fn(),
        };
        preview.activatePreviewModal();
        await preview.openPreviewSource(source, videoItem);

        const playButton = document.getElementById('preview-play') as HTMLButtonElement;
        expect(playButton.hidden).toBe(false);
        expect(mocks.openOriginal).not.toHaveBeenCalled();

        document.getElementById('preview-next')!.click();
        await vi.waitFor(() => expect(mocks.openOriginal).toHaveBeenCalledWith(photoItem.id, photoItem.content_revision));
        expect(mocks.openOriginal).toHaveBeenCalledTimes(1);
        expect(playButton.hidden).toBe(true);
        expect(document.getElementById('preview-modal')?.classList.contains('is-video-slide')).toBe(false);
    });
});
