/* eslint-disable @typescript-eslint/naming-convention */
import { assert } from 'console';
import { trimWhitespace } from './utilities/util';
import TaskRepeater from './utilities/task-repeater';

function test_trimWhitespace() {
  const inputs = ['test    1', 'test    2  ', '     test 3', '    test    4   '];
  const outputs = ['test 1', 'test 2', 'test 3', 'test 4'];
  inputs.forEach((v, i) => {
    assert(trimWhitespace(v) === outputs[i]);
  });
}

function test_taskRepeater() {
  let i = 0;
  const task = (a) => new Promise((res, rej) => {
    console.log(a);
    i += 1;
    if (i < 2) rej('failed');
    if (i >= 2) res('success');
  });

  try {
    const repeater = new TaskRepeater(task, ['arg0'], 5000, 1);
    repeater.run()
      .then((res) => {
        console.log('response', res);
      })
      .catch((err) => {
        console.log('error', err);
      });
  } catch (e) {
    console.log(e);
  }
}

test_trimWhitespace();
test_taskRepeater();
