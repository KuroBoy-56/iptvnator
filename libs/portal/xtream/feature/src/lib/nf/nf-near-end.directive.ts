import {
    Directive,
    ElementRef,
    inject,
    OnDestroy,
    OnInit,
    output,
} from '@angular/core';

/** Emits when the element gets close to the viewport (progressive rows and grids). */
@Directive({ selector: '[nfNearEnd]', standalone: true })
export class NfNearEndDirective implements OnInit, OnDestroy {
    readonly nfNearEnd = output<void>();
    private readonly el = inject(ElementRef<HTMLElement>);
    private observer: IntersectionObserver | null = null;

    ngOnInit(): void {
        if (typeof IntersectionObserver === 'undefined') return;
        this.observer = new IntersectionObserver(
            (entries) => {
                if (entries.some((e) => e.isIntersecting))
                    this.nfNearEnd.emit();
            },
            { rootMargin: '900px 0px' }
        );
        this.observer.observe(this.el.nativeElement);
    }

    ngOnDestroy(): void {
        this.observer?.disconnect();
    }
}
