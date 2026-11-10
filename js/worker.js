/* 在后台线程里训练 RBF 核 SVM，避免主界面卡住 */
importScripts('../vendor/libsvm.js');

let SVM = null;
let model = null;

const ready = (async () => {
  if (!self.libsvm) throw new Error('SVM 库没有加载成功。');
  SVM = await self.libsvm;
  return SVM;
})();

self.onmessage = async (event) => {
  const msg = event.data || {};

  try {
    if (msg.type === 'train') {
      const Lib = await ready;
      post({ type: 'stage', text: '正在整理照片数字…' });

      const samples = msg.samples.map((f) => Array.from(f));
      const labels = msg.labels;

      post({ type: 'stage', text: `正在训练 SVM（${samples.length} 张照片，${msg.classCount} 个类别）…` });

      const trained = new Lib({
        kernel: Lib.KERNEL_TYPES.RBF,
        type: Lib.SVM_TYPES.C_SVC,
        gamma: msg.gamma || 0.05,
        cost: 10,
        quiet: true
      });
      trained.train(samples, labels);

      model = trained;
      post({
        type: 'trained',
        count: samples.length,
        labels: typeof model.getLabels === 'function' ? model.getLabels() : labels.slice()
      });
      return;
    }

    if (msg.type === 'predict') {
      if (!model) throw new Error('模型还没有训练。');
      const label = model.predictOne(Array.from(msg.features));
      post({ type: 'predicted', requestId: msg.requestId, prediction: Number(label) });
      return;
    }

    if (msg.type === 'reset') {
      model = null;
      post({ type: 'reset-done' });
    }
  } catch (err) {
    post({ type: 'error', message: (err && err.message) ? err.message : String(err) });
  }
};

function post(payload) {
  self.postMessage(payload);
}
