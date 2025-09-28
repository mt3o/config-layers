import {describe, expect, it} from "vitest";
import {LayeredConfig} from "../src";

type Labels = {
    button: string;
}

describe('with fallbacks', () => {
    const labels = LayeredConfig.fromLayers<Labels>([
        {name: 'default', config: {button: "Accept cookies"}},
        {name: 'localized', config: {button: 'I would like the biscuits, please!'}},
    ], {
        notFoundHandler: key => '<<' + key.toString() + '>>',
    });

    it('should use localized value', () => {
        expect(labels.button).toBe('I would like the biscuits, please!');
        expect(labels('button', 'xx')).toBe('I would like the biscuits, please!');
        // @ts-ignore
        expect(labels.button2).toBe('<<button2>>');
        // @ts-ignore
        expect(labels['button2']).toBe('<<button2>>');
        // @ts-ignore
        expect(labels('button2', 'cookie msg2')).toBe('cookie msg2');
    })
});
