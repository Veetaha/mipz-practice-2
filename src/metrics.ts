import { throws } from "assert";
import * as ts from "typescript";
import * as util from "./util";

type AttrDeclaration =
    | ts.PropertyDeclaration
    | ts.ParameterDeclaration
    | ts.GetAccessorDeclaration;
const IS_ATTR_DECL = [
    ts.isPropertyDeclaration,
    ts.isParameter,
    ts.isGetAccessorDeclaration,
];

interface CodeMetrics {
    classScoped: Record<string, Pick<ClassMetrics, "dit" | "noc">>;

    // Method inheritance factor
    mif: number;

    // Attribute inheritance factor
    aif: number;

    // Method hiding factor
    mhf: number;

    // Attribute hiding factor
    ahf: number;

    // Polymorphism object factor
    pof: number;

    totalClasses: number;
}

interface ClassMetrics {
    // Depth of inheritance tree
    dit: number;

    // Number of children
    noc: number;

    methods: PropertyMetrics<ts.MethodDeclaration>;

    attrs: PropertyMetrics<AttrDeclaration>;
}

class PropertyMetrics<T extends ts.MethodDeclaration | AttrDeclaration> {
    private = 0;
    inherited: T[] = [];
    overridden: T[] = [];
    own: T[] = [];

    constructor(private readonly kind: "methods" | "attrs") {}

    all(): T[] {
        return [...this.inherited, ...this.overridden, ...this.own];
    }

    aggregate(ctx: CodeMetricsCtx, classTy: ts.Type) {
        const base = getBaseClassMetrics(ctx, classTy);
        const allBaseProps = (base?.[this.kind]?.all() ?? []) as T[];

        for (const prop of classTy.getProperties()) {
            let propDecl = prop.declarations?.[0];

            const isOfKind = {
                methods: ts.isMethodDeclaration,
                attrs(suspect: ts.Node) {
                    return IS_ATTR_DECL.some((is) => is(suspect));
                },
            };

            if (propDecl == null || !isOfKind[this.kind](propDecl)) {
                continue;
            }

            // This is a bug if wrong `kind` is passed.
            // Unfortunately, this invariant has to be dynamic due to TS limitations.
            const decl = propDecl as T;

            if (util.isPrivate(decl)) {
                this.private += 1;
            }

            const declName = decl.name.getText();

            const isInherited = allBaseProps.some(
                (prop) => prop.name.getText() === declName
            );

            if (!isInherited) {
                this.own.push(decl);
                continue;
            }

            const classDecl = classTy.symbol.declarations![0];

            const arr = decl.parent === classDecl ? "overridden" : "inherited";

            this[arr].push(decl);
        }
    }

    // Project the value to extract only the values necessary for debugging
    debug() {
        const mapProps = (props: T[]) =>
            props.map((prop) => prop.name.getText());
        return {
            private: this.private,
            inherited: mapProps(this.inherited),
            overridden: mapProps(this.overridden),
            own: mapProps(this.own),
        };
    }
}

function getClassMetrics(ctx: CodeMetricsCtx, classTy: ts.Type): ClassMetrics {
    const classId = util.typeId(ctx.tc, classTy);

    const cached = ctx.classes.get(classId);

    if (cached != null) {
        return cached;
    }

    const result: ClassMetrics = {
        dit: 0,
        noc: 0,
        methods: new PropertyMetrics("methods"),
        attrs: new PropertyMetrics("attrs"),
    };

    const base = getBaseClassMetrics(ctx, classTy);
    if (base != null) {
        base.noc += 1;
        result.dit += 1 + base.dit;
    }

    result.methods.aggregate(ctx, classTy);
    result.attrs.aggregate(ctx, classTy);

    ctx.classes.set(classId, result);

    return result;
}

function getBaseClassMetrics<T>(
    ctx: CodeMetricsCtx,
    classTy: ts.Type
): ClassMetrics | null {
    const baseTypes = classTy.getBaseTypes();
    if (baseTypes == null || baseTypes.length === 0) {
        return null;
    }

    if (baseTypes.length > 1) {
        throw Error(`unexpected base classes number ${baseTypes.length}`);
    }

    return getClassMetrics(ctx, baseTypes[0]);
}

class CodeMetricsCtx {
    classes = new Map<string, ClassMetrics>();

    constructor(public tc: ts.TypeChecker) {}

    aggregate(nodes: ts.Node[]): CodeMetrics {
        const self = this;
        function visit(classLike: ts.Node) {
            if (ts.isClassLike(classLike)) {
                const classTy = self.tc.getTypeAtLocation(classLike);
                getClassMetrics(self, classTy);
            }

            classLike.forEachChild(visit);
        }

        nodes.forEach(visit);

        const classScoped: CodeMetrics["classScoped"] = {};

        let mif = new Frac(0, 0);
        let aif = new Frac(0, 0);
        let mhf = new Frac(0, 0);
        let ahf = new Frac(0, 0);
        let pof = new Frac(0, 0);

        const entries = this.classes.entries();

        for (const [classId, { noc, dit, methods, attrs }] of entries) {
            classScoped[classId] = { noc, dit };

            const totalMethods = methods.all().length;
            const totalAttrs = attrs.all().length;

            mif.numerator += methods.inherited.length;
            mif.denumerator += totalMethods;

            aif.numerator += attrs.inherited.length;
            aif.denumerator += totalAttrs;

            mhf.numerator += methods.private;
            mhf.denumerator += totalMethods;

            ahf.numerator += attrs.private;
            ahf.denumerator += totalAttrs;

            pof.numerator += methods.overridden.length;
            pof.denumerator += methods.own.length * noc;
        }

        return {
            classScoped,
            mif: mif.eval(),
            aif: aif.eval(),
            mhf: mhf.eval(),
            ahf: ahf.eval(),
            pof: pof.eval(),
            totalClasses: this.classes.size,
        };
    }

    // Project the value to extract only the values necessary for debugging
    debug() {
        return new Map(
            [...this.classes.entries()].map(([className, metrics]) => {
                const val = {
                    dit: metrics.dit,
                    methods: metrics.methods.debug(),
                    attrs: metrics.attrs.debug(),
                };
                return [className, val];
            })
        );
    }
}

class Frac {
    constructor(public numerator: number, public denumerator: number) {}

    eval(): number {
        return this.numerator / this.denumerator;
    }
}

export function aggregate(tc: ts.TypeChecker, nodes: ts.Node[]): CodeMetrics {
    const ctx = new CodeMetricsCtx(tc);
    return ctx.aggregate(nodes);
}
