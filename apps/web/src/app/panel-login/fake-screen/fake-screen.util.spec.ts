import { calculate, parseFakeScreen } from './fake-screen.util';

describe('parseFakeScreen', () => {
    it('returns null when the panel sends none or show is false', () => {
        expect(parseFakeScreen(null)).toBeNull();
        expect(parseFakeScreen({ exists: false })).toBeNull();
        expect(parseFakeScreen({ fake_screen: { show: false, type: 'image' } })).toBeNull();
    });

    it('keeps only http(s) URLs and falls back to the calculator', () => {
        expect(parseFakeScreen({ fake_screen: { show: true, type: 'web', url: 'javascript:alert(1)' } })?.type).toBe('calculator');
        const c = parseFakeScreen({
            fake_screen: { show: true, type: 'carrusel', images: ['https://a.test/1.jpg', 'data:x', 5], interval: 999, unlock: '12a34' },
        });
        expect(c).toEqual({ type: 'carrusel', url: '', images: ['https://a.test/1.jpg'], interval: 120, unlock: '1234' });
        expect(parseFakeScreen({ fake_screen: { show: true, type: 'nope' } })?.type).toBe('calculator');
        expect(parseFakeScreen({ fake_screen: { show: true, type: 'web', url: 'http://a.test' } })?.type).toBe('calculator');
        expect(parseFakeScreen({ fake_screen: { show: true, type: 'web', url: 'https://a.test' } })?.type).toBe('web');
    });
});

describe('calculate', () => {
    it('evaluates + - × ÷ and parentheses without eval', () => {
        expect(calculate('2+3×4')).toBe('14');
        expect(calculate('(2+3)×4')).toBe('20');
        expect(calculate('7÷2')).toBe('3.5');
        expect(calculate('-3+1')).toBe('-2');
    });

    it('reports bad input as Error', () => {
        expect(calculate('')).toBe('');
        expect(calculate('2+')).toBe('Error');
        expect(calculate('1÷0')).toBe('Error');
        expect(calculate('alert(1)')).toBe('Error');
    });
});
