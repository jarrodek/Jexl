/*
 * Jexl
 * Copyright 2020 Tom Shawver
 */
import { expect } from 'chai'
import { Jexl } from '../../lib/Jexl.js'
import Expression from '../../lib/Expression.js'

/** @type Jexl */
let inst

describe('Jexl', () => {
  beforeEach(() => {
    inst = new Jexl()
  })

  describe('compile', () => {
    it('returns an instance of Expression', () => {
      const expr = inst.compile('2/2')
      expect(expr).to.be.an.instanceof(Expression)
    })
    it('compiles the Expression', () => {
      const willFail = () => inst.compile('2 & 2')
      expect(willFail).to.throw('Invalid expression token: &')
    })
  })
  describe('createExpression', () => {
    it('returns an instance of Expression', () => {
      const expr = inst.createExpression('2/2')
      expect(expr).to.be.an.instanceof(Expression)
    })
    it('does not compile the Expression', () => {
      const expr = inst.createExpression('2 wouldFail &^% ..4')
      expect(expr).to.be.an.instanceof(Expression)
    })
  })
  describe('eval', () => {
    it('resolves Promise on success', async () => {
      await expect(inst.eval('2+2')).eventually.to.eq(4)
    })

    it('rejects Promise on error', async () => {
      await expect(inst.eval('2++2')).to.eventually.be.rejectedWith(
        /unexpected/
      )
    })

    it('passes context', async () => {
      await expect(inst.eval('foo', { foo: 'bar' })).eventually.to.eq('bar')
    })

    it('filters collections as expected (issue #61)', async () => {
      const context = {
        a: [{ b: 'A' }, { b: 'B' }, { b: 'C' }]
      }
      await expect(
        inst.eval('a[.b in ["A","B"]]', context)
      ).eventually.to.deep.eq([{ b: 'A' }, { b: 'B' }])
    })
  })
  describe('evalSync', () => {
    it('returns success', () => {
      expect(inst.evalSync('2+2')).to.eq(4)
    })
    it('throws on error', () => {
      expect(inst.evalSync.bind(inst, '2++2')).to.throw(/unexpected/)
    })
    it('passes context', () => {
      expect(inst.evalSync('foo', { foo: 'bar' })).to.eq('bar')
    })
    it('throws if transform fails', () => {
      inst.addTransform('abort', () => {
        throw new Error('oops')
      })
      expect(inst.evalSync.bind(inst, '"hello"|abort')).to.throw(/oops/)
    })
    it('throws if nested transform fails', () => {
      inst.addTransform('q1', () => {
        throw new Error('oops')
      })
      inst.addBinaryOp('is', 100, () => true)
      expect(inst.evalSync.bind(inst, '"hello"|q1 is asdf')).to.throw(/oops/)
    })
    it('filters collections as expected (issue #61)', () => {
      const context = {
        a: [{ b: 'A' }, { b: 'B' }, { b: 'C' }]
      }
      expect(inst.evalSync('a[.b in ["A","B"]]', context)).to.deep.eq([
        { b: 'A' },
        { b: 'B' }
      ])
    })
    it('early-exits boolean AND when the left is false (issue #64)', () => {
      const context = { a: null }
      const expr = 'a != null && a.b'
      expect(inst.evalSync.bind(inst, expr, context)).not.to.throw()
    })
  })
  describe('expr', () => {
    it('returns an evaluatable instance of Expression', () => {
      const expr = inst.expr`2+2`
      expect(expr).to.be.an.instanceof(Expression)
      expect(expr.evalSync()).to.eq(4)
    })
    it('functions as a template string', () => {
      const myVar = 'foo'
      const expr = inst.expr`'myVar' + ${myVar} + 'Car'`
      expect(expr.evalSync({ foo: 'Bar' })).to.eq('myVarBarCar')
    })
    it('works outside of the instance context', () => {
      const myVar = '##'
      inst.addUnaryOp('##', (val) => val * 2)
      const { expr } = inst
      const e = expr`${myVar}5`
      expect(e.evalSync()).to.eq(10)
    })
  })
  describe('addFunction', () => {
    it('allows functions to be defined', async () => {
      inst.addFunction('sayHi', () => 'Hello')
      await expect(inst.eval('sayHi()')).eventually.to.eq('Hello')
    })
    it('allows functions to be retrieved', () => {
      inst.addFunction('ret2', () => 2)
      const f = inst.getFunction('ret2')
      expect(f).not.to.be.undefined
      expect(f()).to.eq(2)
    })
    it('allows functions to be set in batch', async () => {
      inst.addFunctions({
        add1: (val) => val + 1,
        add2: (val) => val + 2
      })
      await expect(inst.eval('add1(add2(2))')).eventually.to.eq(5)
    })
  })
  describe('addTransform', () => {
    it('allows transforms to be defined', async () => {
      inst.addTransform('toCase', (val, args) =>
        args.case === 'upper' ? val.toUpperCase() : val.toLowerCase()
      )
      await expect(
        inst.eval('"hello"|toCase({case:"upper"})')
      ).eventually.to.eq('HELLO')
    })
    it('allows transforms to be retrieved', () => {
      inst.addTransform('ret2', () => 2)
      const t = inst.getTransform('ret2')
      expect(t).not.to.be.undefined
      expect(t()).to.eq(2)
    })
    it('allows transforms to be set in batch', async () => {
      inst.addTransforms({
        add1: (val) => val + 1,
        add2: (val) => val + 2
      })
      await expect(inst.eval('2|add1|add2')).eventually.to.eq(5)
    })
  })
  describe('addBinaryOp', () => {
    it('allows binaryOps to be defined', async () => {
      inst.addBinaryOp(
        '_=',
        20,
        (left, right) => left.toLowerCase() === right.toLowerCase()
      )
      await expect(inst.eval('"FoO" _= "fOo"')).eventually.to.eq(true)
    })
    it('observes weight on binaryOps', async () => {
      inst.addBinaryOp('**', 0, (left, right) => left * 2 + right * 2)
      inst.addBinaryOp('***', 1000, (left, right) => left * 2 + right * 2)
      await expect(
        Promise.all([inst.eval('1 + 2 ** 3 + 4'), inst.eval('1 + 2 *** 3 + 4')])
      ).eventually.to.deep.eq([20, 15])
    })
    it('allows binaryOps to be defined with manual operand evaluation', () => {
      inst.addBinaryOp(
        '$$',
        50,
        (left, right) => {
          return left.eval().then((val) => {
            if (val > 0) return val
            return right.eval()
          })
        },
        true
      )
      let count = 0
      inst.addTransform('inc', (elem) => {
        count++
        return elem
      })
      expect(inst.evalSync('-2|inc $$ 5|inc')).to.eq(5)
      expect(count).to.eq(2)
      count = 0
      expect(inst.evalSync('2|inc $$ -5|inc')).to.eq(2)
      expect(count).to.eq(1)
    })
  })
  describe('addUnaryOp', () => {
    it('allows unaryOps to be defined', async () => {
      inst.addUnaryOp('~', (right) => Math.floor(right))
      await expect(inst.eval('~5.7 + 5')).eventually.to.eq(10)
    })
  })
  describe('removeOp', () => {
    it('allows binaryOps to be removed', async () => {
      inst.removeOp('+')
      await expect(inst.eval('1+2')).to.eventually.be.rejectedWith(/invalid/i)
    })
    it('allows unaryOps to be removed', async () => {
      inst.removeOp('!')
      await expect(inst.eval('!true')).to.eventually.be.rejectedWith(/invalid/i)
    })
  })
})
